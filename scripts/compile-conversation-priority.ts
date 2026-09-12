#!/usr/bin/env bun

import {
  compilePrioritySnapshot,
  writePrioritySnapshot,
} from "../src/conversation-priority.ts";
import { publishSlackHome } from "../src/slack-home.ts";

const snapshot = await compilePrioritySnapshot();
await writePrioritySnapshot(snapshot);
await publishSlackHome(snapshot);

console.log(
  JSON.stringify({
    generatedAt: snapshot.generatedAt,
    liveTasks: snapshot.items.length,
    apollo: snapshot.sources.apollo.activeCount,
    cursor: snapshot.sources.cursor.activeCount,
    cursorStatus: snapshot.sources.cursor.status,
  }),
);
