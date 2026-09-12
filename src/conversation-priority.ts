import type { ConversationRow } from "@vellumai/plugin-api";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const CURSOR_API_BASE_URL = "https://api.cursor.com/v1";
const CURSOR_CREDENTIAL_SERVICE = "cursor";
const CURSOR_CREDENTIAL_FIELD = "api_key";
const MAX_CONVERSATIONS = 100;
const MAX_CURSOR_PAGES = 20;
const MAX_CURSOR_AGENTS = 2_000;

export const PRIORITY_SNAPSHOT_RELATIVE_PATH = join(
  "plugins-data",
  "the-force",
  "conversation-priority.json",
);

export type PrioritySource = "apollo" | "cursor";
export type WorkStatus = "working" | "open" | "finished" | "cancelled" | "failed";

export type ScoreComponent = {
  id: "time-since-last-touch";
  label: string;
  score: number;
  detail: string;
};

export type WorkItem = {
  id: string;
  source: PrioritySource;
  title: string;
  updatedAt: number;
  priority: {
    score: number;
    components: ScoreComponent[];
  };
  status: WorkStatus;
  action: {
    kind: "open-conversation" | "open-url";
    url?: string;
  };
};

export type CursorSourceStatus = "connected" | "not-connected" | "unavailable";

export type PrioritySnapshot = {
  version: 1;
  generatedAt: number;
  ranking: "priority-score-desc";
  sources: {
    apollo: { activeCount: number };
    cursor: {
      activeCount: number;
      status: CursorSourceStatus;
      detail?: string;
    };
  };
  items: WorkItem[];
};

type CursorAgent = {
  id?: unknown;
  name?: unknown;
  latestRunId?: unknown;
  updatedAt?: unknown;
  updated_at?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
  prompt?: { text?: unknown };
  url?: unknown;
};

type CursorRun = {
  status?: unknown;
  updatedAt?: unknown;
  updated_at?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
};

type CursorAgentPage = {
  items?: unknown;
  nextCursor?: unknown;
};

function asFiniteTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1_000;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && value.trim() !== "") {
      return numeric > 10_000_000_000 ? numeric : numeric * 1_000;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function titleFromConversation(conversation: ConversationRow): string {
  return conversation.title?.trim() || "Untitled conversation";
}

function cursorTitle(agent: CursorAgent): string {
  if (typeof agent.name === "string" && agent.name.trim()) {
    return agent.name.trim();
  }
  if (typeof agent.prompt?.text === "string" && agent.prompt.text.trim()) {
    return agent.prompt.text.trim().split("\n", 1)[0]!.slice(0, 120);
  }
  return "Untitled Cursor agent";
}

function cursorAgentUrl(agent: CursorAgent, agentId: string): string {
  if (typeof agent.url === "string") {
    try {
      const url = new URL(agent.url);
      if (
        url.protocol === "https:" &&
        url.hostname === "cursor.com" &&
        url.pathname.startsWith("/agents/")
      ) {
        return url.toString();
      }
    } catch {
      // Fall through to Cursor's stable agent URL.
    }
  }
  return `https://cursor.com/agents/${encodeURIComponent(agentId)}`;
}

function normalizeCursorStatus(value: unknown): WorkStatus {
  switch (typeof value === "string" ? value.toUpperCase() : "") {
    case "CREATING":
    case "RUNNING":
      return "working";
    case "FINISHED":
      return "finished";
    case "CANCELLED":
    case "CANCELED":
      return "cancelled";
    default:
      return "failed";
  }
}

function elapsedLabel(elapsedHours: number): string {
  if (elapsedHours < 1) return "Last touched less than an hour ago";
  if (elapsedHours === 1) return "Last touched 1 hour ago";
  if (elapsedHours < 24) return `Last touched ${elapsedHours} hours ago`;
  const days = Math.floor(elapsedHours / 24);
  return days === 1
    ? "Last touched 1 day ago"
    : `Last touched ${days} days ago`;
}

export function priorityForLastTouch(
  updatedAt: number,
  generatedAt: number,
): WorkItem["priority"] {
  const score = Math.max(0, Math.floor((generatedAt - updatedAt) / 3_600_000));
  return {
    score,
    components: [
      {
        id: "time-since-last-touch",
        label: "Time since last touch",
        score,
        detail: `${elapsedLabel(score)}. Older work receives more priority.`,
      },
    ],
  };
}

function withPriority(
  item: Omit<WorkItem, "priority">,
  generatedAt: number,
): WorkItem {
  return {
    ...item,
    priority: priorityForLastTouch(item.updatedAt, generatedAt),
  };
}

function toApolloItem(
  conversation: ConversationRow,
  generatedAt: number,
): WorkItem {
  return withPriority(
    {
      id: conversation.id,
      source: "apollo",
      title: titleFromConversation(conversation),
      updatedAt: conversation.updatedAt,
      status: conversation.processingStartedAt ? "working" : "open",
      action: { kind: "open-conversation" },
    },
    generatedAt,
  );
}

async function resolveCursorApiKey(): Promise<string> {
  const proc = Bun.spawn(
    [
      "assistant",
      "credentials",
      "reveal",
      "--service",
      CURSOR_CREDENTIAL_SERVICE,
      "--field",
      CURSOR_CREDENTIAL_FIELD,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const apiKey = stdout.trim();
  if (exitCode !== 0 || !apiKey) {
    throw new Error(
      `Cursor credential unavailable${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
    );
  }
  return apiKey;
}

async function cursorFetch<T>(path: string, apiKey: string): Promise<T> {
  const response = await fetch(`${CURSOR_API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Cursor API returned ${response.status}`);
  }
  return (await response.json()) as T;
}

async function listCursorItems(generatedAt: number): Promise<{
  items: WorkItem[];
  status: CursorSourceStatus;
  detail?: string;
}> {
  let apiKey: string;
  try {
    apiKey = await resolveCursorApiKey();
  } catch (error) {
    return {
      items: [],
      status: "not-connected",
      detail: error instanceof Error ? error.message : "Cursor credential unavailable",
    };
  }

  try {
    const agents: CursorAgent[] = [];
    let cursor: string | null = null;
    for (let pageCount = 0; pageCount < MAX_CURSOR_PAGES; pageCount += 1) {
      const params = new URLSearchParams({
        limit: "100",
        includeArchived: "false",
      });
      if (cursor) params.set("cursor", cursor);
      const page = await cursorFetch<CursorAgentPage>(
        `/agents?${params.toString()}`,
        apiKey,
      );
      const pageItems = Array.isArray(page.items) ? page.items : [];
      for (const value of pageItems) {
        if (agents.length >= MAX_CURSOR_AGENTS) break;
        if (
          typeof value === "object" &&
          value !== null &&
          typeof (value as CursorAgent).id === "string" &&
          typeof (value as CursorAgent).latestRunId === "string"
        ) {
          agents.push(value as CursorAgent);
        }
      }
      cursor = typeof page.nextCursor === "string" && page.nextCursor ? page.nextCursor : null;
      if (!cursor || agents.length >= MAX_CURSOR_AGENTS) break;
    }

    const items = await Promise.all(
      agents.map(async (agent): Promise<WorkItem | null> => {
        const agentId = agent.id as string;
        const runId = agent.latestRunId as string;
        try {
          const run = await cursorFetch<CursorRun>(
            `/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`,
            apiKey,
          );
          const updatedAt =
            asFiniteTimestamp(run.updatedAt) ??
            asFiniteTimestamp(run.updated_at) ??
            asFiniteTimestamp(agent.updatedAt) ??
            asFiniteTimestamp(agent.updated_at) ??
            asFiniteTimestamp(run.createdAt) ??
            asFiniteTimestamp(run.created_at) ??
            asFiniteTimestamp(agent.createdAt) ??
            asFiniteTimestamp(agent.created_at);
          if (updatedAt === null) return null;
          return withPriority(
            {
              id: agentId,
              source: "cursor",
              title: cursorTitle(agent),
              updatedAt,
              status: normalizeCursorStatus(run.status),
              action: {
                kind: "open-url",
                url: cursorAgentUrl(agent, agentId),
              },
            },
            generatedAt,
          );
        } catch {
          return null;
        }
      }),
    );

    return {
      items: items.filter((item): item is WorkItem => item !== null),
      status: "connected",
    };
  } catch (error) {
    return {
      items: [],
      status: "unavailable",
      detail: error instanceof Error ? error.message : "Cursor inventory unavailable",
    };
  }
}

function sortByPriority(items: WorkItem[]): WorkItem[] {
  return [...items].sort((left, right) => {
    if (right.priority.score !== left.priority.score) {
      return right.priority.score - left.priority.score;
    }
    if (left.updatedAt !== right.updatedAt) return left.updatedAt - right.updatedAt;
    if (left.source !== right.source) return left.source.localeCompare(right.source);
    return left.id.localeCompare(right.id);
  });
}

export async function compilePrioritySnapshot(options?: {
  generatedAt?: number;
  conversations?: ConversationRow[];
  cursor?: {
    items: WorkItem[];
    status: CursorSourceStatus;
    detail?: string;
  };
}): Promise<PrioritySnapshot> {
  const generatedAt = options?.generatedAt ?? Date.now();
  const [conversations, cursor] = await Promise.all([
    options?.conversations ??
      (await pluginRuntime()).listConversations(MAX_CONVERSATIONS, "standard"),
    options?.cursor ?? listCursorItems(generatedAt),
  ]);
  const apolloItems = conversations
    .filter((conversation) => conversation.archivedAt === null)
    .map((conversation) => toApolloItem(conversation, generatedAt));
  const items = sortByPriority([...apolloItems, ...cursor.items]);

  return {
    version: 1,
    generatedAt,
    ranking: "priority-score-desc",
    sources: {
      apollo: { activeCount: apolloItems.length },
      cursor: {
        activeCount: cursor.items.length,
        status: cursor.status,
        ...(cursor.detail ? { detail: cursor.detail } : {}),
      },
    },
    items,
  };
}

async function pluginRuntime(): Promise<{
  getWorkspaceDir: () => string;
  listConversations: (
    limit: number,
    mode: "standard",
  ) => Promise<ConversationRow[]>;
}> {
  return (await import("@vellumai/plugin-api")) as {
    getWorkspaceDir: () => string;
    listConversations: (
      limit: number,
      mode: "standard",
    ) => Promise<ConversationRow[]>;
  };
}

export function prioritySnapshotPath(workspaceDir: string): string {
  return join(workspaceDir, PRIORITY_SNAPSHOT_RELATIVE_PATH);
}

export async function writePrioritySnapshot(
  snapshot: PrioritySnapshot,
  workspaceDir?: string,
): Promise<void> {
  const destination = prioritySnapshotPath(
    workspaceDir ?? (await pluginRuntime()).getWorkspaceDir(),
  );
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
}

export async function readPrioritySnapshot(
  workspaceDir?: string,
): Promise<PrioritySnapshot | null> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(
        prioritySnapshotPath(
          workspaceDir ?? (await pluginRuntime()).getWorkspaceDir(),
        ),
        "utf8",
      ),
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { version?: unknown }).version !== 1 ||
      !Array.isArray((parsed as { items?: unknown }).items)
    ) {
      return null;
    }
    return parsed as PrioritySnapshot;
  } catch {
    return null;
  }
}
