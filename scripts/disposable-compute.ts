#!/usr/bin/env bun
import {
  BROKER_API_VERSION,
  HttpDisposableComputeBroker,
  getExecutionProfile,
  listExecutionProfiles,
  validateProfileReason,
  type StartTaskRequest,
} from "../src/disposable-compute/index.ts";

const USAGE = `Usage:
  bun run compute profiles
  bun run compute plan --profile <name> --repo <owner/name> --base <ref> --branch <branch> --idempotency-key <key> [--reason <reason>]
  bun run compute start --profile <name> --repo <owner/name> --base <ref> --branch <branch> --idempotency-key <key> [--reason <reason>]
  bun run compute status <task-id>
  bun run compute exec <task-id> [--cwd <relative-path>] [--timeout <seconds>] -- <command> [args...]
  bun run compute finish <task-id> --outcome <completed|abandoned>

Broker commands require FORCE_COMPUTE_BROKER_URL. If FORCE_COMPUTE_BROKER_TOKEN is set,
it is sent as a bearer token. Do not put credentials in command arguments.
`;

interface Options {
  profile?: string;
  repository?: string;
  baseRef?: string;
  branch?: string;
  idempotencyKey?: string;
  reason?: string;
  cwd?: string;
  timeoutSeconds?: number;
  outcome?: "completed" | "abandoned";
  positionals: string[];
  commandArgv: string[];
}

function parseOptions(argv: string[]): Options {
  const options: Options = { positionals: [], commandArgv: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!;
    if (value === "--") {
      options.commandArgv = argv.slice(index + 1);
      break;
    }
    if (value === "--profile") options.profile = argv[++index];
    else if (value === "--repo") options.repository = argv[++index];
    else if (value === "--base") options.baseRef = argv[++index];
    else if (value === "--branch") options.branch = argv[++index];
    else if (value === "--idempotency-key") options.idempotencyKey = argv[++index];
    else if (value === "--reason") options.reason = argv[++index];
    else if (value === "--cwd") options.cwd = argv[++index];
    else if (value === "--timeout") {
      const raw = argv[++index];
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("--timeout must be a positive integer.");
      options.timeoutSeconds = parsed;
    } else if (value === "--outcome") {
      const outcome = argv[++index];
      if (outcome !== "completed" && outcome !== "abandoned") {
        throw new Error("--outcome must be completed or abandoned.");
      }
      options.outcome = outcome;
    } else if (value === "--help" || value === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (value.startsWith("--")) {
      throw new Error(`Unknown option: ${value}`);
    } else {
      options.positionals.push(value);
    }
  }
  return options;
}

function required(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`Missing required ${flag}.`);
  return value;
}

function startRequest(options: Options): StartTaskRequest {
  return {
    apiVersion: BROKER_API_VERSION,
    profile: required(options.profile, "--profile"),
    repository: required(options.repository, "--repo"),
    baseRef: required(options.baseRef, "--base"),
    branch: required(options.branch, "--branch"),
    idempotencyKey: required(options.idempotencyKey, "--idempotency-key"),
    ...(options.reason ? { reason: options.reason } : {}),
  };
}

function brokerFromEnvironment(): HttpDisposableComputeBroker {
  const baseUrl = process.env.FORCE_COMPUTE_BROKER_URL;
  if (!baseUrl) throw new Error("FORCE_COMPUTE_BROKER_URL is not set.");
  return new HttpDisposableComputeBroker({
    baseUrl,
    ...(process.env.FORCE_COMPUTE_BROKER_TOKEN
      ? { authorization: () => `Bearer ${process.env.FORCE_COMPUTE_BROKER_TOKEN}` }
      : {}),
  });
}

async function plan(options: Options): Promise<void> {
  const request = startRequest(options);
  const profile = await getExecutionProfile(request.profile);
  validateProfileReason(profile, request.reason);
  console.log(JSON.stringify({
    action: "plan",
    profile,
    request,
    note: "No broker was called and no worker was provisioned.",
  }, null, 2));
}

async function main(): Promise<void> {
  const [command, ...argv] = process.argv.slice(2);
  const options = parseOptions(argv);
  if (!command || command === "help") {
    console.log(USAGE);
    return;
  }
  if (command === "profiles") {
    console.log(JSON.stringify(await listExecutionProfiles(), null, 2));
    return;
  }
  if (command === "plan") {
    await plan(options);
    return;
  }

  const broker = brokerFromEnvironment();
  if (command === "start") {
    const request = startRequest(options);
    const profile = await getExecutionProfile(request.profile);
    validateProfileReason(profile, request.reason);
    console.log(JSON.stringify(await broker.start(request), null, 2));
    return;
  }

  const taskId = options.positionals[0];
  if (!taskId) throw new Error(`${command} requires a task id.`);
  if (command === "status") {
    console.log(JSON.stringify(await broker.status(taskId), null, 2));
    return;
  }
  if (command === "exec") {
    if (options.commandArgv.length === 0) throw new Error("exec requires a command after --.");
    console.log(JSON.stringify(await broker.exec(taskId, {
      apiVersion: BROKER_API_VERSION,
      argv: options.commandArgv,
      ...(options.cwd ? { cwd: options.cwd } : {}),
      ...(options.timeoutSeconds ? { timeoutSeconds: options.timeoutSeconds } : {}),
    }), null, 2));
    return;
  }
  if (command === "finish") {
    console.log(JSON.stringify(await broker.finish(taskId, {
      apiVersion: BROKER_API_VERSION,
      outcome: options.outcome ?? "completed",
    }), null, 2));
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`disposable-compute: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
