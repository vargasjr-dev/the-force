# Protocols & Transport

Spec compliance for wire protocols (SSE, HTTP, WebSocket). Cross-origin credentials. Transport tagging.

## Rules

1. **Follow the spec, not just what the server does today.** When implementing a protocol parser or client, comply with the specification even if the current server doesn't exercise edge cases. A parser that only handles the common case (e.g. single `data:` line per event) breaks silently the moment a CDN, proxy, or future server behaves differently.

2. **Cross-origin `fetch()` needs explicit `credentials: "include"`.** Browser `fetch` defaults to `credentials: "same-origin"` — cookies and session tokens are **not** sent for cross-origin requests unless you opt in. Failure mode is silent: the request goes out, the server returns 401, the client has no idea cookies were stripped.
   ```ts
   await fetch(crossOriginUrl, {
     credentials: "include",
     // ...
   });
   ```

3. **Tag transports correctly in error metadata.** When adding a new transport or auth path, expand the enum so error metadata correctly identifies which transport failed. Reusing an existing label (`mode: "self-hosted"` for a cloud error) confuses downstream consumers that branch on the value.

4. **Identical wire shape ≠ identical semantics.** Two transports can produce errors with the same JSON shape and still need distinct labels. Shape matches; semantics differ; consumers care about semantics.

## Lessons

- **PR #28005** — SSE parser overwrote `data` on each `data:` line instead of concatenating per spec. Worked against our server, would have broken against any compliant SSE emitter. Same PR: cloud SSE fetch + result POST were missing `credentials: "include"` (worked locally, failed in production); cloud SSE auth errors were tagged `mode: "self-hosted"` (consumers branched on `mode` and did the wrong thing).
