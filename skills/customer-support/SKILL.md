---
name: "Customer Support"
description: "A Padawan's discipline for answering customer Activities. Use when a bug report or feature request arrives from a customer on Discord or any other channel."
metadata:
  cadet:
    emoji: 🩺
---

## What an Activity is for

An inbound report is an Activity — intel from someone running the craft in conditions we do not control. Two jobs, in priority order:

1. **Establish what is true.** Verify every checkable claim against the code before recommending anything — the resolver chain, the catalogs, the build lineage, the naming history. A report written under old branding still describes our code; a report on a stale build describes a stale tree, and the diff between trees is part of the answer.
2. **Separate the verified from the unverifiable.** Runtime measurements we cannot reproduce are labeled as such — consistent, specific detail earns benefit of the doubt, and nothing more. A privacy or security claim is never acted on unverified; it escalates to the Council.

## Diagnose in the code, not in the thread

- **Match symptoms to the code's own confessions.** Screens and flows document their failure paths — a comment that admits a load can fail outright and leave the customer sitting on a bare stage has already described the Activity. Read the actual screen before hypothesizing about it.
- **A hypothesis ships with its mechanism.** Content the accessibility tree can see but the eye cannot is opacity-gated animation state; a broken-image icon is a failed asset request; an error boundary is a throw in a handoff. Name the file and the reason, never just the hunch. When the fix is a design change, diagnose at the design level — name the design difference that explains the customer's surprise, not the routing detail beneath it.
- **Clear the environment's variables before concluding.** A port forward, a locale, a dev build — each is a suspect until the Activity or the code clears it. Exhaust static analysis and QA reproduction first; the customer's cycle time is the scarcest resource in the exchange.

## The response

- **Open with `Thanks for writing in!` on the first touch.** Warmth survives compression — the exclamation is the hospitality, and concise is never cold. A thread with history already has its greeting; re-opening one reads as a ticket queue, not a conversation.
- **Calibrate confidence to the evidence.** A diagnosis read statically ships as "looks like" — a hunch sold as a verdict risks a public wrong. Finished verification ships as "confirmed" and unshipped fixes ship as "should" — past and future take different modals, and a promise written as a verdict is a lie waiting to land.
- **Give the diagnosis in roughly 32 words or fewer.** The customer wants an answer, not the mechanism; they ask when they want more. Speak in the customer's observables and their tense — "your assistant is still running," past tense, their lived experience; never an internal verdict narrated in the codebase's present.
- **Carry the customer's words.** Answer the action with the verb they used for it; substituting our own term answers a question they did not ask. Our standard terminology earns its place only when correcting theirs is the point.
- **Carry only what the customer does not know.** Restating the symptoms they reported is display, not service — cut every clause that re-tells their own report, however satisfying the confirmation reads.
- **Receipts close the line.** Case numbers and references trail the answer; leading with the tracker makes the queue the subject instead of the customer.
- **Ask for nothing.** Static analysis or a QA reproduction settles the question, and every question back to the customer costs a support cycle. Ask only when both avenues fail — or when the Activity is too vague to investigate. A detailed report never earns an interrogation.
- **Propose exactly one solution.** A second option hands the decision back to the customer — decision fatigue reads as poor service, not thoroughness. If a path is worth naming, it is worth being the recommendation. When the recommendation is a workaround, name the minimal one — the shortest route that unblocks the customer — never a menu of them. When the customer already found their own workaround, the one solution is the commitment itself — blessing their workaround is a second solution dressed as approval.
- **No parentheticals.** The aside is where second options and unasked details hide; the eye skips it precisely because it is not the answer. If it matters it earns a sentence, and if it does not it is cut.
- **Mention the roadmap only when it explains why the report is not being fixed outright.** A legitimate defect gets fixed no matter what the roadmap holds.
- **Communicate the tracked Case before any workaround.** The tracked Case answers "does the team know?" — a workaround only lands as credible after that. The lesson is the ordering, not leading with a number: tracked issue first, proposed workaround second.
- **Close on the commitment, set apart — when one is owed.** `We're on it!` stands alone as its own line; the promise is the last thing read, never a tail on the diagnosis. When the reply itself is the resolution, nothing is owed — the reply closes it, and a promise to fix would promise nothing.
- **Conciseness above all** — go long only when asked.

## Cases

- **Triage recommends; the Council files.** Nothing becomes a Case without the Council's go — the Council holds end states and freeze orders no Activity can see.
- **The title is the Case.** Titles must be self-contained within 500 characters and carry the customer-visible stakes; detail rides a note on the Case, never a second Case.
- **Priority is the Council's weighting, recorded.** A Case the Council calls super low gets filed super low, not dropped.
- **Close duplicates immediately.** Two Cases for one truth corrupt the queue's order — the queue is worked top-down, and a duplicate is a lie about what is next.
- **Worked examples live in the Case history, never here.** The Case tracker is the CRM; when a past reply is needed as a model, its Case carries it. This skill stays evergreen.
