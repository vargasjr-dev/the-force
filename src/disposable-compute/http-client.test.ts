import { describe, expect, test } from "bun:test";

import { BROKER_API_VERSION, type BrokerTask } from "./contract.ts";
import { BrokerHttpError, HttpDisposableComputeBroker } from "./http-client.ts";

const task: BrokerTask = {
  apiVersion: BROKER_API_VERSION,
  id: "task-000001",
  status: "ready",
  request: {
    apiVersion: BROKER_API_VERSION,
    profile: "linux-dev",
    repository: "vellum-ai/vellum-assistant",
    baseRef: "origin/main",
    branch: "apollo/example",
    idempotencyKey: "conversation:task",
  },
  createdAt: "2026-09-15T12:00:00.000Z",
  updatedAt: "2026-09-15T12:00:00.000Z",
  expiresAt: "2026-09-15T16:00:00.000Z",
};

describe("HTTP disposable compute client", () => {
  test("sends bounded start requests with late-bound authorization", async () => {
    let request: Request | undefined;
    const broker = new HttpDisposableComputeBroker({
      baseUrl: "https://broker.example.test/",
      authorization: async () => "Bearer secret",
      fetch: async (input, init) => {
        request = new Request(input, init);
        return Response.json(task);
      },
    });
    const response = await broker.start(task.request);
    expect(response.id).toBe(task.id);
    expect(request?.url).toBe("https://broker.example.test/v1/tasks");
    expect(request?.headers.get("authorization")).toBe("Bearer secret");
    expect(await request?.json()).toEqual(task.request);
  });

  test("maps status, exec, and finish to the broker protocol", async () => {
    const requests: Request[] = [];
    const broker = new HttpDisposableComputeBroker({
      baseUrl: "https://broker.example.test",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.endsWith("/exec")) {
          return Response.json({
            apiVersion: BROKER_API_VERSION,
            taskId: task.id,
            commandId: "command-000001",
            exitCode: 0,
            stdout: "ok\n",
            stderr: "",
            startedAt: "2026-09-15T12:01:00.000Z",
            finishedAt: "2026-09-15T12:01:01.000Z",
          });
        }
        return Response.json({
          ...task,
          status: request.url.endsWith("/finish") ? "finished" : task.status,
        });
      },
    });

    await broker.status(task.id);
    await broker.exec(task.id, {
      apiVersion: BROKER_API_VERSION,
      argv: ["bun", "test"],
      cwd: "assistant",
      timeoutSeconds: 120,
    });
    await broker.finish(task.id, {
      apiVersion: BROKER_API_VERSION,
      outcome: "completed",
    });

    expect(requests.map((request) => [request.method, request.url])).toEqual([
      ["GET", `https://broker.example.test/v1/tasks/${task.id}`],
      ["POST", `https://broker.example.test/v1/tasks/${task.id}/exec`],
      ["POST", `https://broker.example.test/v1/tasks/${task.id}/finish`],
    ]);
    expect(await requests[1]?.json()).toEqual({
      apiVersion: BROKER_API_VERSION,
      argv: ["bun", "test"],
      cwd: "assistant",
      timeoutSeconds: 120,
    });
    expect(await requests[2]?.json()).toEqual({
      apiVersion: BROKER_API_VERSION,
      outcome: "completed",
    });
  });

  test("does not allow cleartext remote broker URLs", () => {
    expect(() => new HttpDisposableComputeBroker({
      baseUrl: "http://broker.example.test",
    })).toThrow("must use HTTPS");
  });

  test("surfaces structured broker failures", async () => {
    const broker = new HttpDisposableComputeBroker({
      baseUrl: "http://localhost:3000",
      fetch: async () => Response.json({
        apiVersion: BROKER_API_VERSION,
        error: { code: "profile-at-capacity", message: "No worker capacity." },
      }, { status: 409 }),
    });
    const error = await broker.status(task.id).catch((caught) => caught);
    expect(error).toBeInstanceOf(BrokerHttpError);
    expect(error).toMatchObject({ status: 409, code: "profile-at-capacity" });
  });

  test("rejects invalid successful responses", async () => {
    const broker = new HttpDisposableComputeBroker({
      baseUrl: "http://127.0.0.1:3000",
      fetch: async () => Response.json({ id: "missing-fields" }),
    });
    await expect(broker.status(task.id)).rejects.toThrow("unsupported apiVersion");
  });
});
