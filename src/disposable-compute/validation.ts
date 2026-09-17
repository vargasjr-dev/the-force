import {
  BROKER_API_VERSION,
  EXECUTION_PROFILE_SCHEMA_VERSION,
  type BrokerTask,
  type ExecutionProfile,
  type ExecTaskRequest,
  type ExecTaskResult,
  type FinishTaskRequest,
  type StartTaskRequest,
  type TaskStatus,
} from "./contract.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }
  return value as number;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean.`);
  }
  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} must be a non-empty string array.`);
  }
  return value.map((entry, index) => requireString(entry, `${field}[${index}]`));
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  context: string,
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) {
    throw new Error(`${context} contains unsupported fields: ${unknown.sort().join(", ")}.`);
  }
}

function requireIsoDate(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!Number.isFinite(Date.parse(text))) {
    throw new Error(`${field} must be an ISO date.`);
  }
  return text;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string.`);
  return value;
}

const TASK_STATUSES = new Set<TaskStatus>([
  "queued",
  "provisioning",
  "ready",
  "running",
  "finishing",
  "finished",
  "failed",
  "expired",
]);

export function parseExecutionProfile(value: unknown): ExecutionProfile {
  if (!isRecord(value)) throw new Error("Execution profile must be an object.");
  rejectUnknownFields(value, [
    "schemaVersion", "name", "description", "taskModel", "runtime",
    "capabilities", "cachePolicy", "limits", "isolation", "requiresReason",
    "allowedReasons",
  ], "Execution profile");
  if (value.schemaVersion !== EXECUTION_PROFILE_SCHEMA_VERSION) {
    throw new Error("Execution profile has an unsupported schemaVersion.");
  }
  if (value.taskModel !== "per-task") {
    throw new Error("Execution profile taskModel must be per-task.");
  }
  if (!isRecord(value.runtime)) throw new Error("runtime must be an object.");
  if (!isRecord(value.cachePolicy)) throw new Error("cachePolicy must be an object.");
  if (!isRecord(value.limits)) throw new Error("limits must be an object.");
  if (!isRecord(value.isolation)) throw new Error("isolation must be an object.");
  rejectUnknownFields(value.runtime, ["os", "architecture", "size"], "runtime");
  rejectUnknownFields(
    value.cachePolicy,
    ["gitObjects", "dependencies", "buildArtifacts"],
    "cachePolicy",
  );
  rejectUnknownFields(
    value.limits,
    ["maxConcurrentTasks", "idleTtlMinutes", "maxLifetimeMinutes"],
    "limits",
  );
  rejectUnknownFields(
    value.isolation,
    ["freshHome", "freshTemp", "mountWorkspace", "mountPersonalData"],
    "isolation",
  );

  const os = requireString(value.runtime.os, "runtime.os");
  const architecture = requireString(value.runtime.architecture, "runtime.architecture");
  const size = requireString(value.runtime.size, "runtime.size");
  if (os !== "linux" && os !== "macos") throw new Error(`Unsupported runtime.os: ${os}`);
  if (architecture !== "arm64" && architecture !== "x64") {
    throw new Error(`Unsupported runtime.architecture: ${architecture}`);
  }
  if (size !== "small" && size !== "standard" && size !== "large") {
    throw new Error(`Unsupported runtime.size: ${size}`);
  }

  const mountWorkspace = requireBoolean(value.isolation.mountWorkspace, "isolation.mountWorkspace");
  const mountPersonalData = requireBoolean(value.isolation.mountPersonalData, "isolation.mountPersonalData");
  if (mountWorkspace || mountPersonalData) {
    throw new Error("Execution profiles may not mount workspace or personal data.");
  }

  const requiresReason = requireBoolean(value.requiresReason, "requiresReason");
  const allowedReasons = value.allowedReasons === undefined
    ? undefined
    : requireStringArray(value.allowedReasons, "allowedReasons");
  if (requiresReason && !allowedReasons?.length) {
    throw new Error("Profiles that require a reason must declare allowedReasons.");
  }

  return {
    schemaVersion: EXECUTION_PROFILE_SCHEMA_VERSION,
    name: requireString(value.name, "name"),
    description: requireString(value.description, "description"),
    taskModel: "per-task",
    runtime: { os, architecture, size },
    capabilities: requireStringArray(value.capabilities, "capabilities"),
    cachePolicy: {
      gitObjects: requireBoolean(value.cachePolicy.gitObjects, "cachePolicy.gitObjects"),
      dependencies: requireBoolean(value.cachePolicy.dependencies, "cachePolicy.dependencies"),
      buildArtifacts: requireBoolean(value.cachePolicy.buildArtifacts, "cachePolicy.buildArtifacts"),
    },
    limits: {
      maxConcurrentTasks: requirePositiveInteger(value.limits.maxConcurrentTasks, "limits.maxConcurrentTasks"),
      idleTtlMinutes: requirePositiveInteger(value.limits.idleTtlMinutes, "limits.idleTtlMinutes"),
      maxLifetimeMinutes: requirePositiveInteger(value.limits.maxLifetimeMinutes, "limits.maxLifetimeMinutes"),
    },
    isolation: {
      freshHome: requireBoolean(value.isolation.freshHome, "isolation.freshHome"),
      freshTemp: requireBoolean(value.isolation.freshTemp, "isolation.freshTemp"),
      mountWorkspace: false,
      mountPersonalData: false,
    },
    requiresReason,
    ...(allowedReasons ? { allowedReasons } : {}),
  };
}

export function parseStartTaskRequest(value: unknown): StartTaskRequest {
  if (!isRecord(value)) throw new Error("Start task request must be an object.");
  rejectUnknownFields(value, [
    "apiVersion", "profile", "repository", "baseRef", "branch",
    "idempotencyKey", "reason",
  ], "Start task request");
  if (value.apiVersion !== BROKER_API_VERSION) throw new Error("Unsupported broker apiVersion.");
  const repository = requireString(value.repository, "repository");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("repository must use owner/name form.");
  }
  const branch = requireString(value.branch, "branch");
  if (!/^[A-Za-z0-9_./-]+$/.test(branch)) throw new Error("branch contains unsupported characters.");
  return {
    apiVersion: BROKER_API_VERSION,
    profile: requireString(value.profile, "profile"),
    repository,
    baseRef: requireString(value.baseRef, "baseRef"),
    branch,
    idempotencyKey: requireString(value.idempotencyKey, "idempotencyKey"),
    ...(value.reason === undefined ? {} : { reason: requireString(value.reason, "reason") }),
  };
}

export function parseExecTaskRequest(value: unknown): ExecTaskRequest {
  if (!isRecord(value)) throw new Error("Exec task request must be an object.");
  rejectUnknownFields(value, ["apiVersion", "argv", "cwd", "timeoutSeconds"], "Exec task request");
  if (value.apiVersion !== BROKER_API_VERSION) throw new Error("Unsupported broker apiVersion.");
  const argv = requireStringArray(value.argv, "argv");
  const timeoutSeconds = value.timeoutSeconds === undefined
    ? undefined
    : requirePositiveInteger(value.timeoutSeconds, "timeoutSeconds");
  return {
    apiVersion: BROKER_API_VERSION,
    argv,
    ...(value.cwd === undefined ? {} : { cwd: requireString(value.cwd, "cwd") }),
    ...(timeoutSeconds === undefined ? {} : { timeoutSeconds }),
  };
}

export function parseFinishTaskRequest(value: unknown): FinishTaskRequest {
  if (!isRecord(value)) throw new Error("Finish task request must be an object.");
  rejectUnknownFields(value, ["apiVersion", "outcome"], "Finish task request");
  if (value.apiVersion !== BROKER_API_VERSION) throw new Error("Unsupported broker apiVersion.");
  if (value.outcome !== "completed" && value.outcome !== "abandoned") {
    throw new Error("outcome must be completed or abandoned.");
  }
  return { apiVersion: BROKER_API_VERSION, outcome: value.outcome };
}

export function validateProfileReason(profile: ExecutionProfile, reason?: string): void {
  if (profile.requiresReason && !reason) {
    throw new Error(`${profile.name} requires a reason.`);
  }
  if (reason && profile.allowedReasons && !profile.allowedReasons.includes(reason)) {
    throw new Error(`${profile.name} does not allow reason ${reason}.`);
  }
}

export function parseBrokerTask(value: unknown): BrokerTask {
  if (!isRecord(value)) throw new Error("Broker task must be an object.");
  rejectUnknownFields(value, [
    "apiVersion", "id", "status", "request", "createdAt", "updatedAt",
    "expiresAt", "failure",
  ], "Broker task");
  if (value.apiVersion !== BROKER_API_VERSION) {
    throw new Error("Broker task has an unsupported apiVersion.");
  }
  const status = requireString(value.status, "status") as TaskStatus;
  if (!TASK_STATUSES.has(status)) {
    throw new Error(`Unsupported task status: ${status}`);
  }
  let failure: BrokerTask["failure"];
  if (value.failure !== undefined) {
    if (!isRecord(value.failure)) throw new Error("failure must be an object.");
    rejectUnknownFields(value.failure, ["code", "message"], "failure");
    failure = {
      code: requireString(value.failure.code, "failure.code"),
      message: requireString(value.failure.message, "failure.message"),
    };
  }
  return {
    apiVersion: BROKER_API_VERSION,
    id: requireString(value.id, "id"),
    status,
    request: parseStartTaskRequest(value.request),
    createdAt: requireIsoDate(value.createdAt, "createdAt"),
    updatedAt: requireIsoDate(value.updatedAt, "updatedAt"),
    expiresAt: requireIsoDate(value.expiresAt, "expiresAt"),
    ...(failure ? { failure } : {}),
  };
}

export function parseExecTaskResult(value: unknown): ExecTaskResult {
  if (!isRecord(value)) throw new Error("Exec task result must be an object.");
  rejectUnknownFields(value, [
    "apiVersion", "taskId", "commandId", "exitCode", "stdout", "stderr",
    "startedAt", "finishedAt",
  ], "Exec task result");
  if (value.apiVersion !== BROKER_API_VERSION) {
    throw new Error("Exec task result has an unsupported apiVersion.");
  }
  if (!Number.isInteger(value.exitCode)) {
    throw new Error("exitCode must be an integer.");
  }
  return {
    apiVersion: BROKER_API_VERSION,
    taskId: requireString(value.taskId, "taskId"),
    commandId: requireString(value.commandId, "commandId"),
    exitCode: value.exitCode as number,
    stdout: requireText(value.stdout, "stdout"),
    stderr: requireText(value.stderr, "stderr"),
    startedAt: requireIsoDate(value.startedAt, "startedAt"),
    finishedAt: requireIsoDate(value.finishedAt, "finishedAt"),
  };
}
