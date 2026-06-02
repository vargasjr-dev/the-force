# Frontend Architecture

Local state on the client is overhead. The fewer bits the frontend has to maintain on its own — separate from what the server hands down — the smaller the audit surface for bugs.

## Rules

1. **Limit the amount of bespoke frontend state needed.** In an ideal world, the backend sends up the exact data structures the frontend needs to render rich experiences. Any additional state the frontend is charged with tracking should be viewed as a surface area for more bugs to arise. Before adding a `useRef` / `useState` / store slice, ask: "can the server send this directly, or can I derive it from data the server already sends?" If yes, do that instead.

2. **Audit problems are design problems.** When correctness depends on N write sites agreeing on when to set a shared flag, that's not "just write a test per site" — that's the wrong shape. The fix is fewer write sites, not more vigilance. M read sites sharing a derivation helper beats N write sites maintaining a latch, whenever M < N (which is almost always).

3. **Prefer derivation over latching.** If a piece of state can be re-derived from the message array (or any other authoritative source) at the moment it's read, derive it. Latches that try to remember "what the boundary event already told us" decay every time a new boundary event type ships and forgets to set the latch.

4. **One server message = one client object.** When the server's wire format merges N internal rows into one logical message (e.g. consecutive assistant rows collapsed by a read-side merger), the client must mirror that shape. Fragmenting a single logical message into multiple display objects breaks reconciliation, sort order, and any per-message UI affordance keyed off the server id.

5. **Don't reach for refs to bypass React's commit timing.** A `MutableRefObject` that exists "because state might not have re-rendered yet by the next event" is a smell. The right answer is usually to compute from `prev` inside the `setMessages` updater, which sees the latest committed state. Refs are for non-reactive identity (DOM nodes, stable callbacks), not for shadow state that mirrors the message array.

## Why

Every byte of state the client owns independently is a place the server and client can drift. Drift shows up as: messages in the wrong order, missing reconciliation, bubbles that fragment, tool calls that orphan, scroll position that jumps, focus that escapes. Each of those bugs gets diagnosed individually, but the underlying cost is uniform: the client is being asked to maintain a parallel model of the world.

The healthiest version of a chat client is one where `messages: DisplayMessage[]` plus the open SSE stream is the entire state. Everything else — bubble boundaries, streaming flags, tool-call merging — is derived on read. When that's not yet achievable, every additional bit of local state should be challenged before it ships, not after it causes a bug.
