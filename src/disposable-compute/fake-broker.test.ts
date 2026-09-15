import { describe, expect, test } from "bun:test";

import { BROKER_API_VERSION } from "./contract.ts";
import { FakeDisposableComputeBroker } from "./fake-broker.ts";
import { listExecutionProfiles } from "./profiles.ts";

function startRequest(overrides: Record<string, unknown> = {}) {
  return {
    apiVersion: BROKER_API_VERSION,
    profile: "linux-dev",
    repository: "vellum-ai/vellum-assistant",
    baseRef: "origin/main",
    branch: "apollo/example",
    idempotencyKey: "conversation:task",
    ...overrides,
  };
}

describe("fake disposable compute broker", () => {
  test("models the full task lifecycle", async () => {
    const broker = new FakeDisposableComputeBroker({ profiles: await listExecutionProfiles() });
    const task = await broker.start(startRequest());
    expect(task.status).toBe("ready");

    const result = await broker.exec(task.id, {
      apiVersion: BROKER_API_VERSION,
      argv: ["bun", "test"],
      cwd: "assistant",
    });
    expect(result).toMatchObject({ taskId: task.id, exitCode: 0, stdout: "bun test\n" });
    expect((await broker.status(task.id)).status).toBe("running");

    const finished = await broker.finish(task.id, {
      apiVersion: BROKER_API_VERSION,
      outcome: "completed",
    });
    expect(finished.status).toBe("finished");
    await expect(broker.exec(task.id, {
      apiVersion: BROKER_API_VERSION,
      argv: ["pwd"],
    })).rejects.toThrow("cannot execute");
  });

  test("returns the original task for an identical idempotent start", async () => {
    const broker = new FakeDisposableComputeBroker({ profiles: await listExecutionProfiles() });
    const first = await broker.start(startRequest());
    const second = await broker.start(startRequest());
    expect(second.id).toBe(first.id);
  });

  test("rejects an idempotency key reused for different work", async () => {
    const broker = new FakeDisposableComputeBroker({ profiles: await listExecutionProfiles() });
    await broker.start(startRequest());
    await expect(broker.start(startRequest({ branch: "apollo/other" }))).rejects.toThrow("reused with a different request");
  });

  test("enforces profile concurrency", async () => {
    const profiles = await listExecutionProfiles();
    const linux = profiles.find((profile) => profile.name === "linux-dev")!;
    linux.limits.maxConcurrentTasks = 1;
    const broker = new FakeDisposableComputeBroker({ profiles });
    await broker.start(startRequest());
    await expect(broker.start(startRequest({
      branch: "apollo/other",
      idempotencyKey: "conversation:other",
    }))).rejects.toThrow("concurrent task limit");
  });

  test("expires active tasks at the hard lifetime", async () => {
    let now = new Date("2026-09-15T12:00:00.000Z");
    const broker = new FakeDisposableComputeBroker({
      profiles: await listExecutionProfiles(),
      now: () => now,
    });
    const task = await broker.start(startRequest());
    now = new Date(task.expiresAt);
    const expired = await broker.status(task.id);
    expect(expired.status).toBe("expired");
    expect(expired.failure?.code).toBe("task-expired");
  });
});
