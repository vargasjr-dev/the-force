import {
  BROKER_API_VERSION,
  type BrokerTask,
  type DisposableComputeBroker,
  type ExecTaskRequest,
  type ExecTaskResult,
  type ExecutionProfile,
  type FinishTaskRequest,
  type StartTaskRequest,
} from "./contract.ts";
import {
  parseExecTaskRequest,
  parseFinishTaskRequest,
  parseStartTaskRequest,
  validateProfileReason,
} from "./validation.ts";

const ACTIVE_STATUSES = new Set(["queued", "provisioning", "ready", "running", "finishing"]);

export interface FakeCommandContext {
  task: BrokerTask;
  request: ExecTaskRequest;
}

export type FakeCommandExecutor = (
  context: FakeCommandContext,
) => Promise<Pick<ExecTaskResult, "exitCode" | "stdout" | "stderr">>;

export interface FakeBrokerOptions {
  profiles: ExecutionProfile[];
  now?: () => Date;
  execute?: FakeCommandExecutor;
}

function requestFingerprint(request: StartTaskRequest): string {
  return JSON.stringify(request, Object.keys(request).sort());
}

function cloneTask(task: BrokerTask): BrokerTask {
  return structuredClone(task);
}

export class FakeDisposableComputeBroker implements DisposableComputeBroker {
  readonly #profiles: Map<string, ExecutionProfile>;
  readonly #tasks = new Map<string, BrokerTask>();
  readonly #idempotency = new Map<string, { fingerprint: string; taskId: string }>();
  readonly #now: () => Date;
  readonly #execute: FakeCommandExecutor;
  #nextTask = 1;
  #nextCommand = 1;

  constructor(options: FakeBrokerOptions) {
    this.#profiles = new Map(options.profiles.map((profile) => [profile.name, profile]));
    this.#now = options.now ?? (() => new Date());
    this.#execute = options.execute ?? (async ({ request }) => ({
      exitCode: 0,
      stdout: `${request.argv.join(" ")}\n`,
      stderr: "",
    }));
  }

  #expireTasks(): void {
    const now = this.#now();
    for (const [id, task] of this.#tasks) {
      if (ACTIVE_STATUSES.has(task.status) && Date.parse(task.expiresAt) <= now.getTime()) {
        this.#tasks.set(id, {
          ...task,
          status: "expired",
          updatedAt: now.toISOString(),
          failure: { code: "task-expired", message: "Task exceeded its hard lifetime." },
        });
      }
    }
  }

  #getTask(taskId: string): BrokerTask {
    this.#expireTasks();
    const task = this.#tasks.get(taskId);
    if (!task) throw new Error(`Unknown task: ${taskId}`);
    return task;
  }

  async start(input: StartTaskRequest): Promise<BrokerTask> {
    this.#expireTasks();
    const request = parseStartTaskRequest(input);
    const profile = this.#profiles.get(request.profile);
    if (!profile) throw new Error(`Unknown execution profile: ${request.profile}`);
    validateProfileReason(profile, request.reason);

    const fingerprint = requestFingerprint(request);
    const existing = this.#idempotency.get(request.idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error(`Idempotency key ${request.idempotencyKey} was reused with a different request.`);
      }
      return cloneTask(this.#getTask(existing.taskId));
    }

    const active = [...this.#tasks.values()].filter((task) => {
      return task.request.profile === profile.name && ACTIVE_STATUSES.has(task.status);
    });
    if (active.length >= profile.limits.maxConcurrentTasks) {
      throw new Error(`${profile.name} is at its concurrent task limit.`);
    }

    const now = this.#now();
    const id = `task-${String(this.#nextTask++).padStart(6, "0")}`;
    const task: BrokerTask = {
      apiVersion: BROKER_API_VERSION,
      id,
      status: "ready",
      request,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + profile.limits.maxLifetimeMinutes * 60_000).toISOString(),
    };
    this.#tasks.set(id, task);
    this.#idempotency.set(request.idempotencyKey, { fingerprint, taskId: id });
    return cloneTask(task);
  }

  async status(taskId: string): Promise<BrokerTask> {
    return cloneTask(this.#getTask(taskId));
  }

  async exec(taskId: string, input: ExecTaskRequest): Promise<ExecTaskResult> {
    const request = parseExecTaskRequest(input);
    let task = this.#getTask(taskId);
    if (task.status !== "ready" && task.status !== "running") {
      throw new Error(`Task ${taskId} cannot execute commands while ${task.status}.`);
    }
    const startedAt = this.#now().toISOString();
    task = { ...task, status: "running", updatedAt: startedAt };
    this.#tasks.set(taskId, task);
    const result = await this.#execute({ task: cloneTask(task), request });
    const finishedAt = this.#now().toISOString();
    task = { ...task, updatedAt: finishedAt };
    this.#tasks.set(taskId, task);
    return {
      apiVersion: BROKER_API_VERSION,
      taskId,
      commandId: `command-${String(this.#nextCommand++).padStart(6, "0")}`,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      startedAt,
      finishedAt,
    };
  }

  async finish(taskId: string, input: FinishTaskRequest): Promise<BrokerTask> {
    parseFinishTaskRequest(input);
    const task = this.#getTask(taskId);
    if (task.status === "expired" || task.status === "finished") return cloneTask(task);
    if (task.status !== "ready" && task.status !== "running" && task.status !== "failed") {
      throw new Error(`Task ${taskId} cannot finish while ${task.status}.`);
    }
    const finished: BrokerTask = {
      ...task,
      status: "finished",
      updatedAt: this.#now().toISOString(),
    };
    this.#tasks.set(taskId, finished);
    return cloneTask(finished);
  }
}
