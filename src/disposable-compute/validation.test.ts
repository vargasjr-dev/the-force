import { describe, expect, test } from "bun:test";

import { BROKER_API_VERSION } from "./contract.ts";
import { getExecutionProfile, listExecutionProfiles } from "./profiles.ts";
import {
  parseExecTaskRequest,
  parseStartTaskRequest,
  validateProfileReason,
} from "./validation.ts";

describe("execution profiles", () => {
  test("loads the Linux and gated macOS profiles", async () => {
    const profiles = await listExecutionProfiles();
    expect(profiles.map((profile) => profile.name)).toEqual(["linux-dev", "macos-qa"]);
    expect(profiles[0]?.isolation.mountWorkspace).toBe(false);
    expect(profiles[0]?.isolation.mountPersonalData).toBe(false);
    expect(profiles[1]?.requiresReason).toBe(true);
  });

  test("enforces the macOS reason gate", async () => {
    const profile = await getExecutionProfile("macos-qa");
    expect(() => validateProfileReason(profile)).toThrow("requires a reason");
    expect(() => validateProfileReason(profile, "routine-tests")).toThrow("does not allow reason");
    expect(() => validateProfileReason(profile, "apple-platform")).not.toThrow();
  });
});

describe("broker requests", () => {
  test("accepts a bounded start request", () => {
    expect(parseStartTaskRequest({
      apiVersion: BROKER_API_VERSION,
      profile: "linux-dev",
      repository: "vellum-ai/vellum-assistant",
      baseRef: "origin/main",
      branch: "apollo/example",
      idempotencyKey: "conversation:task",
    })).toMatchObject({ repository: "vellum-ai/vellum-assistant" });
  });

  test("rejects caller-supplied repository URLs", () => {
    expect(() => parseStartTaskRequest({
      apiVersion: BROKER_API_VERSION,
      profile: "linux-dev",
      repository: "https://github.com/vellum-ai/vellum-assistant.git",
      baseRef: "origin/main",
      branch: "apollo/example",
      idempotencyKey: "conversation:task",
    })).toThrow("owner/name");
  });

  test("accepts argv commands without accepting environment values", () => {
    const request = parseExecTaskRequest({
      apiVersion: BROKER_API_VERSION,
      argv: ["bun", "test"],
      cwd: "assistant",
      timeoutSeconds: 120,
    });
    expect(request.argv).toEqual(["bun", "test"]);
    expect(request).not.toHaveProperty("env");
  });
});
