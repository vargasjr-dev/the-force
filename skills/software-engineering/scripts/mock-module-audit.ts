#!/usr/bin/env bun
/**
 * Audit `mock.module(...)` sites for a given module path.
 *
 * Bun's `mock.module("../foo.js", () => ({...}))` REPLACES the module's exports
 * — any consumer that imports a symbol not declared on the mock will crash with
 * `SyntaxError: Export named 'X' not found in module`.
 *
 * Run this BEFORE adding a new export to a module. The output lists every test
 * file that mocks the module, so each can have a stub added for the new export.
 *
 * Usage:
 *   bun run scripts/mock-module-audit.ts <module-substring> [--root <dir>]
 *
 * Examples:
 *   mock-module-audit.ts qdrant-client                   (matches any path containing qdrant-client)
 *   mock-module-audit.ts qdrant-client --root assistant  (limit to assistant/ only)
 *
 * Lesson it encodes (PR #27459): adding `resolveQdrantUrl` to qdrant-client.ts
 * broke 10 unrelated test files because their mock.module calls didn't declare
 * the new symbol.
 */

import { spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";

const USAGE = `Usage: mock-module-audit.ts <module-substring> [--root <dir>]

Lists every *.test.ts file that mocks a module path containing <module-substring>,
and prints the symbols each mock currently provides.

Options:
  --root <dir>     Search root (default: cwd)
  -h, --help       Show this help
`;

interface Args {
  needle: string;
  root: string;
}

function parseArgs(argv: string[]): Args {
  let needle: string | undefined;
  let root = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") root = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (!a.startsWith("--")) {
      needle = a;
    } else {
      console.error(`Unknown argument: ${a}\n`);
      console.error(USAGE);
      process.exit(1);
    }
  }
  if (!needle) {
    console.error(USAGE);
    process.exit(1);
  }
  if (!existsSync(root)) {
    console.error(`❌ Root not found: ${root}`);
    process.exit(1);
  }
  return { needle, root };
}

interface Hit {
  file: string;
  line: number;
  modulePath: string;
  symbols: string[];
}

function findMockSites(root: string, needle: string): Hit[] {
  // Prefer ripgrep when available; fall back to grep -rn (skipping node_modules).
  const useRg = spawnSync("which", ["rg"], { encoding: "utf-8" }).status === 0;
  const pattern = `mock\\.module\\(["'][^"']*${escapeRegex(needle)}[^"']*["']`;

  let r;
  if (useRg) {
    r = spawnSync(
      "rg",
      [
        "-n",
        "--no-heading",
        "-g",
        "**/*.test.ts",
        "-g",
        "**/*.test.tsx",
        "-e",
        pattern,
        root,
      ],
      { encoding: "utf-8" },
    );
  } else {
    r = spawnSync(
      "grep",
      [
        "-rn",
        "--include=*.test.ts",
        "--include=*.test.tsx",
        "--exclude-dir=node_modules",
        "--exclude-dir=.git",
        "--exclude-dir=dist",
        "-E",
        pattern,
        root,
      ],
      { encoding: "utf-8" },
    );
  }

  if (r.status !== 0 && r.status !== 1) {
    console.error(`(grep/rg errored: ${r.stderr ?? "(no stderr)"})`);
    process.exit(1);
  }
  const lines = (r.stdout ?? "").split("\n").filter(Boolean);
  const hits: Hit[] = [];
  for (const ln of lines) {
    const m = ln.match(/^([^:]+):(\d+):/);
    if (!m) continue;
    const file = m[1];
    const lineno = parseInt(m[2], 10);
    const ctx = extractMockContext(file, lineno);
    if (!ctx) continue;
    hits.push({
      file,
      line: lineno,
      modulePath: ctx.modulePath,
      symbols: ctx.symbols,
    });
  }
  return hits;
}

function extractMockContext(
  file: string,
  startLine: number,
): { modulePath: string; symbols: string[] } | null {
  let body: string;
  try {
    body = readFileSync(file, "utf-8");
  } catch {
    return null;
  }
  const lines = body.split("\n");
  // Grab a window around the mock.module call
  const windowSize = 60;
  const slice = lines
    .slice(Math.max(0, startLine - 1), Math.min(lines.length, startLine + windowSize))
    .join("\n");

  const pathMatch = slice.match(/mock\.module\(["']([^"']+)["']/);
  const modulePath = pathMatch ? pathMatch[1] : "(unknown)";

  // Symbols are top-level keys in the returned object: `() => ({ key: ..., key2: ... })`
  // We capture the first balanced { ... } after the => ({.
  const factoryMatch = slice.match(/=>\s*\(\s*\{([\s\S]*?)\}\s*\)/);
  const symbols: string[] = [];
  if (factoryMatch) {
    const objBody = factoryMatch[1];
    // naive top-level key extraction — good enough for typical mock factories
    const depthStack: string[] = [];
    let buf = "";
    for (const ch of objBody) {
      if (ch === "{" || ch === "(" || ch === "[") depthStack.push(ch);
      else if (ch === "}" || ch === ")" || ch === "]") depthStack.pop();
      else if (ch === "," && depthStack.length === 0) {
        const key = buf.trim().split(":")[0]?.trim();
        if (key && /^[A-Za-z_$][\w$]*$/.test(key)) symbols.push(key);
        buf = "";
        continue;
      }
      buf += ch;
    }
    const tail = buf.trim().split(":")[0]?.trim();
    if (tail && /^[A-Za-z_$][\w$]*$/.test(tail)) symbols.push(tail);
  }
  return { modulePath, symbols };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const hits = findMockSites(args.root, args.needle);
  if (hits.length === 0) {
    console.log(`No mock.module sites found matching "${args.needle}" under ${args.root}.`);
    return;
  }

  console.log(`Found ${hits.length} mock.module site(s) for "${args.needle}":\n`);
  for (const hit of hits) {
    const relFile = hit.file.replace(args.root + "/", "");
    console.log(`  ${relFile}:${hit.line}`);
    console.log(`    path:    "${hit.modulePath}"`);
    console.log(
      `    symbols: ${hit.symbols.length > 0 ? hit.symbols.join(", ") : "(none parsed)"}`,
    );
    console.log("");
  }
  console.log(
    `If you're adding a new export, make sure each of these mock factories declares a stub for it.`,
  );
}

main();
