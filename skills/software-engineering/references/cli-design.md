# CLI design

CLI commands should mirror how source code would invoke the underlying
capability. Avoid CLI-only abstractions that don't exist at the API layer.

## Verb shape — CRUD, not state

Use verbs that name **the operation**, not the **noun's state**:

| Bad             | Good        |
|-----------------|-------------|
| `status`        | `get`       |
| `reconnect`     | `refresh`   |
| `info`          | `get`       |
| `enable` / `disable` | `set` (with a value) |

`get` reads. `refresh` re-establishes (mutates). `list` enumerates. `set`
mutates with an argument. These map 1:1 to underlying handler operations,
so a reader can predict what each command does from the verb alone.

`status` is the worst offender: it implies "tell me the state" but says
nothing about whether the read is live or cached, cheap or expensive,
side-effectful or not. Replace with `get`.

## `get` is always live

A `get` command must do **the same probe the source code would do** when
it needs a fresh answer. If the runtime caches results (5-minute TTL,
in-memory snapshots, etc.), the CLI's `get` invalidates that cache before
reading. A user typing `assistant channels get slack` is asking the live
question "is slack working *right now*", not "was slack working five
minutes ago".

This eliminates a class of confused-user bugs where the CLI reports
"ready" but the channel has been broken since the last cache refresh.

## No `--flag` that flips read/write semantics

If you reach for `--refresh` on a `get` command (or `--check` on a
mutating command), stop. You've conflated two operations. Split them:

- `get` = always read, always live
- `refresh` = always mutate (re-establish the connection / state)

Flags are for *parameters* of an operation (`--bot-token <token>`), not
for changing what kind of operation it is. A flag that converts a GET
into a POST is a code smell.

## Channel/subject-specific surface stays at the verb level

When a verb applies to multiple subjects (channels, providers, accounts),
put the verb at the parent level and the subject as an argument:

```
# Good — verb owns the shape, subject is data
assistant channels refresh slack --bot-token xoxb-...
assistant channels refresh telegram --bot-token 123:abc

# Bad — every subject re-implements verbs as a sub-tree
assistant channels slack reconnect --bot-token xoxb-...
assistant channels telegram reconnect --bot-token 123:abc
```

The first shape composes: `channels refresh` (no arg) iterates every
subject. The second shape forces every new subject to grow its own
`{status, reconnect, clear}` tree, which can't be iterated and drifts
in naming over time.

Subject-specific flags live on the parent verb. Validate them against
the subject argument inside the action.

## Descriptions describe what the command does, not modes that don't exist

A command description that says "(read-only by default)" or "(safe by
default)" or "(dry-run by default)" implies a non-default mode. If there
is no flag, env var, or sibling subcommand that flips to the non-default
behavior, the qualifier is a lie.

- Bad: `"Inspect and repair the assistant SQLite database (read-only by default)"`
  — no flag exists to make it writable; the parent group has both a
  read-only subcommand (`status`) and mutating ones (`repair`), so
  "by default" has no referent.
- Good: `"Inspect and repair the assistant SQLite database"` — describes
  the surface area honestly. Per-subcommand semantics live on the
  subcommand's own description.

Rule of thumb: if you can't point at the thing that *isn't* default,
delete the "by default" qualifier.

## When in doubt, ask: "what would the source code do?"

If `channelReadinessService.getReadiness(channel)` is the function the
runtime calls, the CLI's `channels get <channel>` should be a thin
wrapper that calls exactly that — same args, same semantics, no extra
flags or modes. The CLI is an interface to the runtime, not its own
abstraction.
