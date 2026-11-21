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
- **A hypothesis ships with its mechanism.** Content the accessibility tree can see but the eye cannot is opacity-gated animation state; a broken-image icon is a failed asset request; an error boundary is a throw in a handoff. Name the file and the reason, never just the hunch.
- **Clear the environment's variables before concluding.** A port forward, a locale, a dev build — each is a suspect until the Activity or the code clears it. Exhaust static analysis and QA reproduction first; the customer's cycle time is the scarcest resource in the exchange.

## The response

- **Open with `Thanks for writing in!`** Warmth survives compression — the exclamation is the hospitality, and concise is never cold.
- **Calibrate confidence to the evidence.** A diagnosis read statically ships as "looks like" — a hunch sold as a verdict risks a public wrong.
- **Give the diagnosis in roughly 32 words or fewer.** The customer wants an answer, not the mechanism; they ask when they want more. Speak in the customer's observables and their tense — "your assistant is still running," past tense, their lived experience; never an internal verdict narrated in the codebase's present.
- **Ask for nothing.** Static analysis or a QA reproduction settles the question, and every question back to the customer costs a support cycle. Ask only when both avenues fail — or when the Activity is too vague to investigate. A detailed report never earns an interrogation.
- **Mention the roadmap only when it explains why the report is not being fixed outright.** A legitimate defect gets fixed no matter what the roadmap holds.
- **Close on the commitment, set apart.** `We're on it!` stands alone as its own line — the promise is the last thing read, never a tail on the diagnosis.
- **Conciseness above all** — go long only when asked.

## Cases

- **Triage recommends; the Council files.** Nothing becomes a Case without the Council's go — the Council holds end states and freeze orders no Activity can see.
- **The title is the Case.** Titles must be self-contained within 500 characters and carry the customer-visible stakes; detail rides a note on the Case, never a second Case.
- **Priority is the Council's weighting, recorded.** A Case the Council calls super low gets filed super low, not dropped.
- **Close duplicates immediately.** Two Cases for one truth corrupt the queue's order — the queue is worked top-down, and a duplicate is a lie about what is next.
- **Worked examples live in the Case history, never here.** The Case tracker is the CRM; when a past reply is needed as a model, its Case carries it. This skill stays evergreen.
