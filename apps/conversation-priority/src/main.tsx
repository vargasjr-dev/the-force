/// <reference types="@vellumai/plugin-api/app" />

import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";

import "./styles.css";

const DATA_URL = "/v1/x/plugins/the-force/conversation-priority";

type Source = "apollo" | "cursor";
type CursorStatus = "connected" | "not-connected" | "unavailable";

type WorkItem = {
  id: string;
  source: Source;
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

type DeskPayload = {
  generatedAt: number;
  ranking: "last-updated";
  sources: {
    apollo: { activeCount: number };
    cursor: { activeCount: number; status: CursorStatus };
  };
  items: WorkItem[];
};

function relativeTime(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function scoreLabel(score: number): string {
  return score > 0
    ? Math.floor(score / 1_000).toLocaleString("en-US")
    : "unknown";
}

function actionLabel(item: WorkItem): string {
  return item.source === "apollo" ? "Open chat" : "Open agent";
}

function App() {
  const [payload, setPayload] = useState<DeskPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await window.vellum.fetch(DATA_URL);
      if (!response.ok)
        throw new Error(`Could not load the queue (${response.status})`);
      const next = (await response.json()) as DeskPayload;
      if (!next || !Array.isArray(next.items))
        throw new Error("The queue returned an unexpected response");
      setPayload(next);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not load the queue",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const apolloItems = useMemo(
    () => payload?.items.filter((item) => item.source === "apollo") ?? [],
    [payload],
  );
  const cursorItems = useMemo(
    () => payload?.items.filter((item) => item.source === "cursor") ?? [],
    [payload],
  );

  async function open(item: WorkItem) {
    setOpeningId(item.id);
    try {
      const response = await window.vellum.fetch(DATA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          item.action.kind === "open-url"
            ? { action: "open-url", url: item.action.url }
            : {
                action: "open-conversation",
                conversationId: item.id,
                title: item.title,
              },
        ),
      });
      if (!response.ok)
        throw new Error(`Could not open conversation (${response.status})`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not open this item",
      );
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <main className="desk-shell">
      <header className="masthead">
        <div className="eyebrow">
          <span className="pulse" /> CHIEF OF STAFF / LIVE QUEUE
        </div>
        <div className="headline-row">
          <div>
            <h1>
              What moves
              <br />
              next.
            </h1>
            <p>
              Every active Apollo conversation and live Cursor agent, ordered
              solely by its last update.
            </p>
          </div>
          <button
            className="refresh"
            onClick={() => void load()}
            disabled={loading}
          >
            <span className={loading ? "spinner" : "refresh-mark"}>
              {loading ? "" : "↻"}
            </span>
            {loading ? "Refreshing" : "Refresh"}
          </button>
        </div>
        <div className="ranking-rule">
          <span>RANKING RULE</span>
          <strong>Last updated first</strong>
          <span>Score = update timestamp</span>
        </div>
      </header>

      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}

      <section className="summary-grid" aria-label="Queue summary">
        <SummaryCard
          label="Apollo"
          count={payload?.sources.apollo.activeCount ?? 0}
          detail="active conversations"
        />
        <SummaryCard
          label="Cursor"
          count={payload?.sources.cursor.activeCount ?? 0}
          detail={cursorDetail(payload?.sources.cursor.status)}
          muted={payload?.sources.cursor.status !== "connected"}
        />
        <SummaryCard
          label="Now"
          count={
            payload?.items.filter((item) => item.status === "working").length ??
            0
          }
          detail="in motion"
          accent
        />
      </section>

      {loading && (
        <section className="loading-state">
          <span className="loader" /> Reading the live queues
        </section>
      )}

      {!loading && payload && (
        <section className="queue" aria-label="Priority queue">
          <div className="queue-heading">
            <span>Priority order</span>
            <span>
              {payload.items.length} live item
              {payload.items.length === 1 ? "" : "s"}
            </span>
          </div>
          {payload.items.length === 0 ? (
            <div className="empty-state">
              <strong>Nothing is moving.</strong>
              <span>Apollo and Cursor are both quiet right now.</span>
            </div>
          ) : (
            payload.items.map((item, index) => (
              <WorkRow
                item={item}
                index={index}
                busy={openingId === item.id}
                onOpen={() => void open(item)}
                key={`${item.source}:${item.id}`}
              />
            ))
          )}
        </section>
      )}

      {!loading && payload?.sources.cursor.status === "not-connected" && (
        <aside className="cursor-note">
          <span className="note-kicker">
            Cursor is not connected to this plugin
          </span>
          <p>
            Connect a Cursor API key as <code>the-force / cursor_api_key</code>{" "}
            to add unfinished Cursor agents to this list.
          </p>
        </aside>
      )}

      {!loading &&
        cursorItems.length === 0 &&
        payload?.sources.cursor.status === "connected" && (
          <aside className="cursor-note quiet">
            <span className="note-kicker">Cursor is clear</span>
            <p>No Cursor agent is currently creating or running.</p>
          </aside>
        )}

      {!loading &&
        apolloItems.length === 0 &&
        payload?.sources.apollo.activeCount === 0 && (
          <p className="microcopy">
            No active Apollo conversations were returned.
          </p>
        )}
    </main>
  );
}

function SummaryCard({
  label,
  count,
  detail,
  muted,
  accent,
}: {
  label: string;
  count: number;
  detail: string;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={`summary-card${muted ? " muted" : ""}${accent ? " accent" : ""}`}
    >
      <span>{label}</span>
      <strong>{count}</strong>
      <small>{detail}</small>
    </div>
  );
}

function WorkRow({
  item,
  index,
  busy,
  onOpen,
}: {
  item: WorkItem;
  index: number;
  busy: boolean;
  onOpen: () => void;
}) {
  return (
    <article className={`work-row ${item.status}`}>
      <div className="ordinal">{String(index + 1).padStart(2, "0")}</div>
      <div className="work-copy">
        <div className="source-line">
          <span className={`source-tag ${item.source}`}>{item.source}</span>
          <span className="state-dot" />
          <span>{item.status === "working" ? "working" : "open"}</span>
          <span className="age">updated {relativeTime(item.updatedAt)}</span>
        </div>
        <h2>{item.title}</h2>
      </div>
      <div className="score-block" title={`Unix timestamp: ${item.score}`}>
        <span>score</span>
        <strong>{scoreLabel(item.score)}</strong>
        <small>
          {item.score > 0
            ? new Date(item.score).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : "timestamp unavailable"}
        </small>
      </div>
      <button
        className="open-pill"
        onClick={onOpen}
        disabled={busy}
        aria-label={`${actionLabel(item)}: ${item.title}`}
      >
        {busy ? "Opening" : actionLabel(item)} <span>↗</span>
      </button>
    </article>
  );
}

function cursorDetail(status: CursorStatus | undefined): string {
  if (status === "not-connected") return "not connected";
  if (status === "unavailable") return "temporarily unavailable";
  return "unfinished agents";
}

render(<App />, document.getElementById("app")!);
