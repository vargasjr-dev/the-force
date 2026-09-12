import { getWorkspaceDir, publishEvent } from "@vellumai/plugin-api";

import { readPrioritySnapshot } from "../src/conversation-priority.ts";

export const description =
  "Compiled priority scores for live Apollo conversations and Cursor agent sessions";

export async function GET(): Promise<Response> {
  const snapshot = await readPrioritySnapshot(getWorkspaceDir());
  if (snapshot === null) {
    return Response.json(
      {
        error:
          "The priority snapshot has not been compiled yet. The Force schedule will populate it shortly.",
      },
      { status: 503 },
    );
  }
  return Response.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
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
