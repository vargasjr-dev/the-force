import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  compilePrioritySnapshot,
  priorityForLastTouch,
  readPrioritySnapshot,
  writePrioritySnapshot,
  type WorkItem,
} from "./conversation-priority.ts";

test("the time-since-last-touch component increases priority for older work", () => {
  const generatedAt = 100 * 3_600_000;
  expect(priorityForLastTouch(generatedAt - 5 * 3_600_000, generatedAt)).toEqual({
    score: 5,
    components: [
      {
        id: "time-since-last-touch",
        label: "Time since last touch",
        score: 5,
        detail: "Last touched 5 hours ago. Older work receives more priority.",
      },
    ],
  });
  expect(priorityForLastTouch(generatedAt - 90 * 3_600_000, generatedAt).score).toBe(
    90,
  );
});

test("the compiler ranks Apollo and Cursor sessions in one deterministic queue", async () => {
  const generatedAt = 10 * 3_600_000;
  const cursorUpdatedAt = 7 * 3_600_000;
  const cursorItem: WorkItem = {
    id: "cursor-1",
    source: "cursor",
    title: "Finished Cursor session",
    updatedAt: cursorUpdatedAt,
    status: "finished",
    priority: priorityForLastTouch(cursorUpdatedAt, generatedAt),
    action: { kind: "open-url", url: "https://cursor.com/agents/cursor-1" },
  };
  const snapshot = await compilePrioritySnapshot({
    generatedAt,
    conversations: [
      {
        id: "apollo-1",
        title: "Open Apollo conversation",
        updatedAt: (19 * 3_600_000) / 2,
        lastMessageAt: (19 * 3_600_000) / 2,
        archivedAt: null,
        processingStartedAt: null,
      },
      {
        id: "archived",
        title: "Archived",
        updatedAt: 0,
        lastMessageAt: 0,
        archivedAt: 1,
        processingStartedAt: null,
      },
    ],
    cursor: { items: [cursorItem], status: "connected" },
  });

  expect(snapshot.ranking).toBe("priority-score-desc");
  expect(snapshot.sources).toEqual({
    apollo: { activeCount: 1 },
    cursor: { activeCount: 1, status: "connected" },
  });
  expect(snapshot.items.map((item) => [item.source, item.id, item.priority.score])).toEqual([
    ["cursor", "cursor-1", 3],
    ["apollo", "apollo-1", 0],
  ]);
});

test("the snapshot write is atomically readable", async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), "conversation-priority-"));
  const snapshot = await compilePrioritySnapshot({
    generatedAt: 1_000_000,
    conversations: [],
    cursor: { items: [], status: "connected" },
  });

  await writePrioritySnapshot(snapshot, workspaceDir);
  await expect(readPrioritySnapshot(workspaceDir)).resolves.toEqual(snapshot);
});
