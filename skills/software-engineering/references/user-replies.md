# Replying to user reports (Discord / support)

Lessons from real reply threads (Velcro triage, Nov 2026).

## Communicate the tracked issue before proposed workarounds

When a user's report maps to a filed/tracked case, say so BEFORE any
workaround — "we're tracking support for it now as Case #N" — then give the
workaround. The tracked issue is the answer to "does the team know?"; the
workaround only lands as credible after that. Don't just "lead with the case
number" as a slogan: the ordering rule is tracked-issue-first, workaround-second.

## Name THE minimal workaround — one, not two

Pick the single shortest path that unblocks the user and name exactly that.
Two alternatives in one reply doubles their reading cost and implies none of
them is the real answer. If both paths are genuinely equal, pick one anyway;
the second can come out in the follow-up thread if they ask.

## Never ship an unverified "should"

Any claim of the form "restarting the app should pick it up" is testable in
our own code before the reply is sent. A user who does the workaround and hits
the untested step burns their goodwill on OUR hedge. Either verify the step in
the code (or on a real setup) first, or explicitly scope the claim: "the CLI
frontends work against it today; the app part is what the case covers."
