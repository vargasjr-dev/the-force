import {
  type BrokerErrorBody,
  type BrokerTask,
  type DisposableComputeBroker,
  type ExecTaskRequest,
  type ExecTaskResult,
  type FinishTaskRequest,
  type StartTaskRequest,
} from "./contract.ts";
import {
  parseBrokerTask,
  parseExecTaskResult,
  parseStartTaskRequest,
  parseExecTaskRequest,
  parseFinishTaskRequest,
} from "./validation.ts";

export class BrokerHttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "BrokerHttpError";
    this.status = status;
    this.code = code;
  }
}

export interface HttpBrokerOptions {
  baseUrl: string;
  authorization?: () => string | Promise<string>;
  fetch?: typeof globalThis.fetch;
}

function taskPath(taskId: string): string {
  if (!/^task-[a-z0-9-]{6,64}$/.test(taskId)) {
    throw new Error(`Invalid task id: ${taskId}`);
  }
  return encodeURIComponent(taskId);
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("Broker URL must use HTTPS unless it targets localhost.");
  }
  return url.toString().replace(/\/$/, "");
}

function parseErrorBody(value: unknown): BrokerErrorBody | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const error = (value as Record<string, unknown>).error;
  if (typeof error !== "object" || error === null || Array.isArray(error)) return null;
  const code = (error as Record<string, unknown>).code;
  const message = (error as Record<string, unknown>).message;
  if (typeof code !== "string" || typeof message !== "string") return null;
  return { apiVersion: "v1", error: { code, message } };
}

export class HttpDisposableComputeBroker implements DisposableComputeBroker {
  readonly #baseUrl: string;
  readonly #authorization?: () => string | Promise<string>;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: HttpBrokerOptions) {
    this.#baseUrl = normalizeBaseUrl(options.baseUrl);
    this.#authorization = options.authorization;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async #request(path: string, init: RequestInit): Promise<unknown> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body !== undefined) headers.set("content-type", "application/json");
    if (this.#authorization) {
      const authorization = await this.#authorization();
      if (!authorization.trim()) throw new Error("Broker authorization header is empty.");
      headers.set("authorization", authorization);
    }

    const response = await this.#fetch(`${this.#baseUrl}${path}`, { ...init, headers });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new BrokerHttpError(response.status, "invalid-response", "Broker returned invalid JSON.");
      }
    }
    if (!response.ok) {
      const brokerError = parseErrorBody(body);
      throw new BrokerHttpError(
        response.status,
        brokerError?.error.code ?? "broker-request-failed",
        brokerError?.error.message ?? `Broker request failed with status ${response.status}.`,
      );
    }
    return body;
  }

  async start(request: StartTaskRequest): Promise<BrokerTask> {
    const body = parseStartTaskRequest(request);
    return parseBrokerTask(await this.#request("/v1/tasks", {
      method: "POST",
      body: JSON.stringify(body),
    }));
  }

  async status(taskId: string): Promise<BrokerTask> {
    return parseBrokerTask(await this.#request(`/v1/tasks/${taskPath(taskId)}`, {
      method: "GET",
    }));
  }

  async exec(taskId: string, request: ExecTaskRequest): Promise<ExecTaskResult> {
    const body = parseExecTaskRequest(request);
    return parseExecTaskResult(await this.#request(`/v1/tasks/${taskPath(taskId)}/exec`, {
      method: "POST",
      body: JSON.stringify(body),
    }));
  }

  async finish(taskId: string, request: FinishTaskRequest): Promise<BrokerTask> {
    const body = parseFinishTaskRequest(request);
    return parseBrokerTask(await this.#request(`/v1/tasks/${taskPath(taskId)}/finish`, {
      method: "POST",
      body: JSON.stringify(body),
    }));
  }
}
