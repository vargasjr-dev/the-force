export const BROKER_API_VERSION = "v1" as const;
export const EXECUTION_PROFILE_SCHEMA_VERSION = 1 as const;

export type RuntimeOs = "linux" | "macos";
export type RuntimeArchitecture = "arm64" | "x64";
export type RuntimeSize = "small" | "standard" | "large";

export interface ExecutionProfile {
  schemaVersion: typeof EXECUTION_PROFILE_SCHEMA_VERSION;
  name: string;
  description: string;
  taskModel: "per-task";
  runtime: {
    os: RuntimeOs;
    architecture: RuntimeArchitecture;
    size: RuntimeSize;
  };
  capabilities: string[];
  cachePolicy: {
    gitObjects: boolean;
    dependencies: boolean;
    buildArtifacts: boolean;
  };
  limits: {
    maxConcurrentTasks: number;
    idleTtlMinutes: number;
    maxLifetimeMinutes: number;
  };
  isolation: {
    freshHome: boolean;
    freshTemp: boolean;
    mountWorkspace: false;
    mountPersonalData: false;
  };
  requiresReason: boolean;
  allowedReasons?: string[];
}

export interface StartTaskRequest {
  apiVersion: typeof BROKER_API_VERSION;
  profile: string;
  repository: string;
  baseRef: string;
  branch: string;
  idempotencyKey: string;
  reason?: string;
}

export type TaskStatus =
  | "queued"
  | "provisioning"
  | "ready"
  | "running"
  | "finishing"
  | "finished"
  | "failed"
  | "expired";

export interface BrokerTask {
  apiVersion: typeof BROKER_API_VERSION;
  id: string;
  status: TaskStatus;
  request: StartTaskRequest;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  failure?: {
    code: string;
    message: string;
  };
}

export interface ExecTaskRequest {
  apiVersion: typeof BROKER_API_VERSION;
  argv: string[];
  cwd?: string;
  timeoutSeconds?: number;
}

export interface ExecTaskResult {
  apiVersion: typeof BROKER_API_VERSION;
  taskId: string;
  commandId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  startedAt: string;
  finishedAt: string;
}

export interface FinishTaskRequest {
  apiVersion: typeof BROKER_API_VERSION;
  outcome: "completed" | "abandoned";
}

export interface BrokerErrorBody {
  apiVersion: typeof BROKER_API_VERSION;
  error: {
    code: string;
    message: string;
  };
}

export interface DisposableComputeBroker {
  start(request: StartTaskRequest): Promise<BrokerTask>;
  status(taskId: string): Promise<BrokerTask>;
  exec(taskId: string, request: ExecTaskRequest): Promise<ExecTaskResult>;
  finish(taskId: string, request: FinishTaskRequest): Promise<BrokerTask>;
}
