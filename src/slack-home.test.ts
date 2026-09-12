import { expect, test } from "bun:test";

import type { PrioritySnapshot } from "./conversation-priority.ts";
import { buildSlackHomeView } from "./slack-home.ts";

const snapshot: PrioritySnapshot = {
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
        score: 10,
        components: [
          {
            id: "time-since-last-touch",
            label: "Time since last touch",
            score: 10,
            detail: "Last touched 10 minutes ago. Older work receives more priority.",
          },
        ],
      },
      action: { kind: "open-url", url: "https://cursor.com/agents/cursor-1" },
    },
  ],
};

test("Slack Home renders the compiled ranking rather than independent source data", () => {
  const view = buildSlackHomeView(snapshot) as {
    type: string;
    blocks: Array<Record<string, unknown>>;
  };

  expect(view.type).toBe("home");
  expect(JSON.stringify(view.blocks)).toContain("Cursor session");
  expect(JSON.stringify(view.blocks)).toContain("Priority *10*");
  expect(JSON.stringify(view.blocks)).toContain("https://cursor.com/agents/cursor-1");
});
