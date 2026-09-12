import { afterAll, expect, mock, test } from "bun:test";

const published: unknown[] = [];

mock.module("@vellumai/plugin-api", () => ({
  listConversations: async () => [
    {
      id: "apollo-1",
      title: "Apollo conversation",
      updatedAt: 1_000,
      lastMessageAt: 9_999,
      archivedAt: null,
      processingStartedAt: null,
    },
  ],
  publishEvent: async (event: unknown) => {
    published.push(event);
  },
  resolveCredential: async () => "test-cursor-key",
}));

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = String(input);
  if (url.includes("/agents?")) {
    return Response.json({
      items: [
        {
          id: "cursor-1",
          latestRunId: "run-1",
          name: "Cursor session",
          updatedAt: "1970-01-01T00:00:02.000Z",
        },
      ],
    });
  }
  if (url.includes("/agents/cursor-1/runs/run-1")) {
    return Response.json({
      status: "RUNNING",
      updatedAt: "1970-01-01T00:00:03.000Z",
    });
  }
  return new Response("not found", { status: 404 });
}) as typeof fetch;

const route = await import("./conversation-priority.ts");

test("merges Apollo and active Cursor work by last update score", async () => {
  const response = await route.GET();
  const payload = (await response.json()) as {
    ranking: string;
    sources: {
      apollo: { activeCount: number };
      cursor: { activeCount: number; status: string };
    };
    items: Array<{ source: string; score: number; updatedAt: number }>;
  };

  expect(payload.ranking).toBe("last-updated");
  expect(payload.sources).toEqual({
    apollo: { activeCount: 1 },
    cursor: { activeCount: 1, status: "connected" },
  });
  expect(
    payload.items.map((item) => ({
      source: item.source,
      score: item.score,
      updatedAt: item.updatedAt,
    })),
  ).toEqual([
    { source: "cursor", score: 3_000, updatedAt: 3_000 },
    { source: "apollo", score: 1_000, updatedAt: 1_000 },
  ]);
});

test("rejects non-Cursor URLs and emits supported navigation events", async () => {
  const rejected = await route.POST(
    new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "open-url", url: "https://example.com" }),
    }),
  );
  expect(rejected.status).toBe(400);

  const opened = await route.POST(
    new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "open-conversation",
        conversationId: "apollo-1",
        title: "Apollo conversation",
      }),
    }),
  );
  expect(opened.ok).toBe(true);
  expect(published).toHaveLength(1);
  expect(published[0]).toMatchObject({
    message: {
      type: "open_conversation",
      conversationId: "apollo-1",
    },
  });
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});
