/// <reference types="@vellumai/plugin-api/app" />

import { render } from "preact";
import { useEffect, useId, useState } from "preact/hooks";

import "./styles.css";

const DATA_URL = "/v1/x/plugins/the-force/conversation-priority";

type Source = "apollo" | "cursor";
type WorkStatus = "working" | "open" | "finished" | "cancelled" | "failed";

type ScoreComponent = {
  id: string;
  label: string;
  score: number;
  detail: string;
};

type WorkItem = {
  id: string;
  source: Source;
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

type DeskPayload = {
  generatedAt: number;
  items: WorkItem[];
};

function totalLabel(count: number): string {
  return `${count} live task${count === 1 ? "" : "s"}`;
}

function statusLabel(item: WorkItem): string {
  if (item.source === "apollo") {
    return item.status === "working" ? "working" : "open";
  }
  if (item.status === "working") return "working";
  if (item.status === "finished") return "finished";
  if (item.status === "cancelled") return "cancelled";
  return "failed";
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
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : `Could not load the queue (${response.status})`,
        );
      }
      const next = (await response.json()) as DeskPayload;
      if (!next || !Array.isArray(next.items)) {
        throw new Error("The queue returned an unexpected response");
      }
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
      if (!response.ok) {
        throw new Error(`Could not open this task (${response.status})`);
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not open this task",
      );
    } finally {
      setOpeningId(null);
    }
  }

  const itemCount = payload?.items.length ?? 0;

  return (
    <main className="desk-shell">
      <header className="taskbar">
        <span className="task-count">{totalLabel(itemCount)}</span>
        <button
          className="refresh"
          onClick={() => void load()}
          disabled={loading}
          title="Reload the most recently compiled priority snapshot"
        >
          <span className={loading ? "spinner" : "refresh-mark"}>
            {loading ? "" : "↻"}
          </span>
          {loading ? "Refreshing" : "Refresh"}
        </button>
      </header>

      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}

      {loading && (
        <section className="loading-state">
          <span className="loader" /> Reading compiled priorities
        </section>
      )}

      {!loading && payload && (
        <section className="queue" aria-label="Live tasks by priority">
          {payload.items.length === 0 ? (
            <div className="empty-state">
              <strong>Nothing is moving.</strong>
              <span>No active Apollo conversations or Cursor agents.</span>
            </div>
          ) : (
            payload.items.map((item) => (
              <WorkRow
                item={item}
                busy={openingId === item.id}
                onOpen={() => void open(item)}
                key={`${item.source}:${item.id}`}
              />
            ))
          )}
        </section>
      )}
    </main>
  );
}

function WorkRow({
  item,
  busy,
  onOpen,
}: {
  item: WorkItem;
  busy: boolean;
  onOpen: () => void;
}) {
  const detailId = useId();
  const score = item.priority.score;

  return (
    <button
      className={`work-row ${item.status}`}
      onClick={onOpen}
      disabled={busy}
      aria-label={`Open ${item.title}`}
      type="button"
    >
      <span className="work-copy">
        <span className="source-line">
          <span className={`source-tag ${item.source}`}>{item.source}</span>
          <span className="state-dot" />
          <span>{statusLabel(item)}</span>
        </span>
        <strong>{item.title}</strong>
      </span>
      <span className="score-block" aria-describedby={detailId}>
        <span className="score-number">{busy ? "…" : score}</span>
        <span className="score-label">priority</span>
        <span className="score-popover" id={detailId} role="tooltip">
          <span className="score-popover-heading">Priority score {score}</span>
          <span className="score-components">
            {item.priority.components.map((component) => (
              <span className="score-component" key={component.id}>
                <span className="score-component-title">
                  <span>{component.label}</span>
                  <strong>+{component.score}</strong>
                </span>
                <span>{component.detail}</span>
              </span>
            ))}
          </span>
        </span>
      </span>
    </button>
  );
}

render(<App />, document.getElementById("app")!);
