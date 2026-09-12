import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const published: unknown[] = [];
const workspaceDir = join("/tmp", `conversation-priority-route-${crypto.randomUUID()}`);

mock.module("@vellumai/plugin-api", () => ({
  getWorkspaceDir: () => workspaceDir,
  publishEvent: async (event: unknown) => {
    published.push(event);
  },
}));

const route = await import("./conversation-priority.ts");

beforeAll(async () => {
  const snapshotPath = join(
    workspaceDir,
    "plugins-data",
    "the-force",
    "conversation-priority.json",
  );
  await mkdir(join(workspaceDir, "plugins-data", "the-force"), {
    recursive: true,
  });
  await writeFile(
    snapshotPath,
    JSON.stringify({
      version: 1,
      generatedAt: 1_000_000,
      ranking: "priority-score-desc",
      sources: {
        apollo: { activeCount: 1 },
        cursor: { activeCount: 1, status: "connected" },
      },
      items: [
        {
          id: "cursor-1",
          source: "cursor",
          title: "Cursor session",
          updatedAt: 900_000,
          status: "finished",
          priority: {
            score: 1,
            components: [
              {
                id: "time-since-last-touch",
                label: "Time since last touch",
                score: 1,
                detail: "Last touched 1 minute ago. Older work receives more priority.",
              },
            ],
          },
          action: {
            kind: "open-url",
            url: "https://cursor.com/agents/cursor-1",
          },
        },
      ],
    }),
  );
});

test("returns the compiled snapshot without performing source collection", async () => {
  const response = await route.GET();
  expect(response.ok).toBe(true);
  await expect(response.json()).resolves.toMatchObject({
    ranking: "priority-score-desc",
    sources: { cursor: { activeCount: 1, status: "connected" } },
    items: [
      {
        id: "cursor-1",
        priority: {
          score: 1,
          components: [
            { id: "time-since-last-touch", score: 1 },
          ],
        },
      },
    ],
  });
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

afterAll(async () => {
  await rm(workspaceDir, { recursive: true, force: true });
});
