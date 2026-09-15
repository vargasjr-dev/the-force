import { describe, expect, test } from "bun:test";

const script = new URL("./disposable-compute.ts", import.meta.url).pathname;

async function run(args: string[], env: Record<string, string> = {}) {
  const process = Bun.spawn(["bun", "run", script, ...args], {
    env: { PATH: processEnvPath(), ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { stdout, stderr, exitCode };
}

function processEnvPath(): string {
  return process.env.PATH ?? "";
}

describe("disposable compute command", () => {
  test("lists saved profiles without a broker", async () => {
    const result = await run(["profiles"]);
    expect(result.exitCode).toBe(0);
    const profiles = JSON.parse(result.stdout);
    expect(profiles.map((profile: { name: string }) => profile.name)).toEqual([
      "linux-dev",
      "macos-qa",
    ]);
  });

  test("plans locally without provisioning", async () => {
    const result = await run([
      "plan",
      "--profile", "linux-dev",
      "--repo", "vellum-ai/vellum-assistant",
      "--base", "origin/main",
      "--branch", "apollo/example",
      "--idempotency-key", "conversation:task",
    ]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      action: "plan",
      note: "No broker was called and no worker was provisioned.",
    });
  });

  test("fails closed when no broker is configured", async () => {
    const result = await run([
      "status",
      "task-000001",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("FORCE_COMPUTE_BROKER_URL is not set");
  });
});
