import type { PrioritySnapshot, WorkItem } from "./conversation-priority.ts";

const SLACK_HOME_USER_ID = "U05D5EGNNMS";
const MAX_HOME_ITEMS = 30;

function statusLabel(item: WorkItem): string {
  if (item.source === "apollo") {
    return item.status === "working" ? "Apollo working" : "Apollo open";
  }
  switch (item.status) {
    case "working":
      return "Cursor working";
    case "finished":
      return "Cursor finished";
    case "cancelled":
      return "Cursor cancelled";
    default:
      return "Cursor failed";
  }
}

function statusEmoji(item: WorkItem): string {
  if (item.status === "working") return "🟠";
  if (item.source === "cursor" && item.status === "finished") return "⚪";
  if (item.source === "cursor") return "⚫";
  return "🔵";
}

function itemBlocks(item: WorkItem): Record<string, unknown>[] {
  const lines = [
    `*${statusEmoji(item)} ${item.title}*`,
    `Priority *${item.priority.score}* · ${statusLabel(item)}`,
  ];
  const block: Record<string, unknown> = {
    type: "section",
    text: { type: "mrkdwn", text: lines.join("\n") },
  };
  if (item.action.kind === "open-url" && item.action.url) {
    block.accessory = {
      type: "button",
      text: { type: "plain_text", text: "Open", emoji: true },
      url: item.action.url,
      action_id: `open_cursor_${item.id}`,
    };
  }
  return [block];
}

export function buildSlackHomeView(snapshot: PrioritySnapshot): Record<string, unknown> {
  const items = snapshot.items.slice(0, MAX_HOME_ITEMS);
  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "Live task priority", emoji: true },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `*${snapshot.items.length} live tasks* · ${snapshot.sources.apollo.activeCount} Apollo · ${snapshot.sources.cursor.activeCount} Cursor · compiled <!date^${Math.floor(snapshot.generatedAt / 1_000)}^{time}|recently>`,
        },
      ],
    },
    { type: "divider" },
  ];

  for (const item of items) {
    blocks.push(...itemBlocks(item));
  }

  if (snapshot.items.length > items.length) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Showing the top ${items.length} of ${snapshot.items.length} ranked tasks.`,
        },
      ],
    });
  }

  if (snapshot.sources.cursor.status !== "connected") {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Cursor source: ${snapshot.sources.cursor.status}${snapshot.sources.cursor.detail ? ` (${snapshot.sources.cursor.detail})` : ""}`,
        },
      ],
    });
  }

  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "_Force priority queue. Scores are compiled from the same snapshot as the conversation-priority app._",
      },
    ],
  });

  return { type: "home", blocks };
}

export async function publishSlackHome(snapshot: PrioritySnapshot): Promise<void> {
  const proc = Bun.spawn(
    [
      "assistant",
      "credentials",
      "reveal",
      "--service",
      "slack_channel",
      "--field",
      "bot_token",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const token = stdout.trim();
  if (exitCode !== 0 || !token) {
    throw new Error(
      `Slack credential unavailable${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
    );
  }

  const response = await fetch("https://slack.com/api/views.publish", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      user_id: SLACK_HOME_USER_ID,
      view: buildSlackHomeView(snapshot),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const result = (await response.json()) as {
    ok?: unknown;
    error?: unknown;
  };
  if (!response.ok || result.ok !== true) {
    throw new Error(
      `Slack views.publish failed${typeof result.error === "string" ? `: ${result.error}` : ""}`,
    );
  }
}
