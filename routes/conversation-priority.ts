import {
  listConversations,
  publishEvent,
  resolveCredential,
  type ConversationRow,
} from "@vellumai/plugin-api";

export const description =
  "Live Apollo conversations and active Cursor agents, ranked only by recency";

const CURSOR_API_BASE_URL = "https://api.cursor.com/v1";
const CURSOR_CREDENTIAL = "the-force/cursor_api_key";
const ACTIVE_CURSOR_STATUSES = new Set(["CREATING", "RUNNING"]);
const MAX_CONVERSATIONS = 100;
const MAX_CURSOR_AGENTS = 100;

type PrioritySource = "apollo" | "cursor";

type PriorityItem = {
  id: string;
  source: PrioritySource;
  title: string;
  updatedAt: number;
  score: number;
  status: "working" | "open";
  action: {
    kind: "open-conversation" | "open-url";
    label: string;
    url?: string;
  };
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

function conversationUpdatedAt(conversation: ConversationRow): number {
  return conversation.updatedAt;
}

function toApolloItem(conversation: ConversationRow): PriorityItem {
  const updatedAt = conversationUpdatedAt(conversation);
  return {
    id: conversation.id,
    source: "apollo",
    title: conversation.title?.trim() || "Untitled conversation",
    updatedAt,
    score: updatedAt,
    status: conversation.processingStartedAt ? "working" : "open",
    action: {
      kind: "open-conversation",
      label: "Open chat",
    },
  };
}

async function cursorFetch<T>(path: string, apiKey: string): Promise<T> {
  const response = await fetch(`${CURSOR_API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Cursor API returned ${response.status}`);
  }
  return (await response.json()) as T;
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
      // Use the stable agent URL below when Cursor returns an unusable value.
    }
  }
  return `https://cursor.com/agents/${encodeURIComponent(agentId)}`;
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

async function listCursorItems(): Promise<{
  items: PriorityItem[];
  status: "connected" | "not-connected" | "unavailable";
}> {
  let apiKey: string;
  try {
    apiKey = await resolveCredential(CURSOR_CREDENTIAL);
  } catch {
    return { items: [], status: "not-connected" };
  }

  try {
    const page = await cursorFetch<CursorAgentPage>(
      `/agents?limit=${MAX_CURSOR_AGENTS}&includeArchived=false`,
      apiKey,
    );
    const agents = Array.isArray(page.items) ? page.items : [];
    const candidates = agents.filter(
      (value): value is CursorAgent =>
        typeof value === "object" &&
        value !== null &&
        typeof (value as CursorAgent).id === "string" &&
        typeof (value as CursorAgent).latestRunId === "string",
    );

    const resolved = await Promise.all(
      candidates.map(async (agent) => {
        const agentId = agent.id as string;
        const runId = agent.latestRunId as string;
        try {
          const run = await cursorFetch<CursorRun>(
            `/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`,
            apiKey,
          );
          if (
            typeof run.status !== "string" ||
            !ACTIVE_CURSOR_STATUSES.has(run.status)
          ) {
            return null;
          }
          const updatedAt =
            asFiniteTimestamp(run.updatedAt) ??
            asFiniteTimestamp(run.updated_at) ??
            asFiniteTimestamp(agent.updatedAt) ??
            asFiniteTimestamp(agent.updated_at) ??
            asFiniteTimestamp(run.createdAt) ??
            asFiniteTimestamp(run.created_at) ??
            asFiniteTimestamp(agent.createdAt) ??
            asFiniteTimestamp(agent.created_at) ??
            0;
          return {
            id: agentId,
            source: "cursor" as const,
            title: cursorTitle(agent),
            updatedAt,
            score: updatedAt,
            status: "working" as const,
            action: {
              kind: "open-url" as const,
              label: "Open agent",
              url: cursorAgentUrl(agent, agentId),
            },
          } satisfies PriorityItem;
        } catch {
          return null;
        }
      }),
    );

    return {
      items: resolved.filter((item): item is PriorityItem => item !== null),
      status: "connected",
    };
  } catch {
    return { items: [], status: "unavailable" };
  }
}

function sortByRecency(items: PriorityItem[]): PriorityItem[] {
  return items.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.id.localeCompare(right.id);
  });
}

export async function GET(): Promise<Response> {
  const [conversations, cursor] = await Promise.all([
    listConversations(MAX_CONVERSATIONS, "standard"),
    listCursorItems(),
  ]);

  const apolloItems = conversations
    .filter((conversation) => conversation.archivedAt === null)
    .map(toApolloItem);
  const items = sortByRecency([...apolloItems, ...cursor.items]);

  return Response.json({
    generatedAt: Date.now(),
    ranking: "last-updated",
    sources: {
      apollo: { activeCount: apolloItems.length },
      cursor: { activeCount: cursor.items.length, status: cursor.status },
    },
    items,
  });
}

export async function POST(request: Request): Promise<Response> {
  let body: {
    action?: unknown;
    conversationId?: unknown;
    title?: unknown;
    url?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action === "open-url") {
    if (typeof body.url !== "string") {
      return Response.json({ error: "url is required" }, { status: 400 });
    }
    let url: URL;
    try {
      url = new URL(body.url);
    } catch {
      return Response.json({ error: "Invalid URL" }, { status: 400 });
    }
    if (
      url.protocol !== "https:" ||
      url.hostname !== "cursor.com" ||
      !url.pathname.startsWith("/agents/")
    ) {
      return Response.json(
        { error: "Only Cursor agent URLs are allowed" },
        { status: 400 },
      );
    }
    await publishEvent({
      id: crypto.randomUUID(),
      emittedAt: new Date().toISOString(),
      message: {
        type: "open_url",
        url: url.toString(),
        title: "Open Cursor agent",
      },
    });
    return Response.json({ ok: true });
  }

  if (
    body.action !== "open-conversation" ||
    typeof body.conversationId !== "string" ||
    !body.conversationId
  ) {
    return Response.json(
      { error: "conversationId is required" },
      { status: 400 },
    );
  }

  await publishEvent({
    id: crypto.randomUUID(),
    emittedAt: new Date().toISOString(),
    message: {
      type: "open_conversation",
      conversationId: body.conversationId,
      ...(typeof body.title === "string" && body.title.trim()
        ? { title: body.title.trim() }
        : {}),
    },
  });

  return Response.json({ ok: true });
}
