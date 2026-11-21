---
name: "Velcro"
description: "A Padawan's discipline for triaging user reports from the holonet — verifying claims against the code, filing Velcro cases, and answering the reporter. Use when a bug report or feature request arrives on Discord or any other channel."
metadata:
  vellum:
    emoji: 🩺
---

## What a report is for

A user report is intel from someone running the craft in conditions we do not control. Two jobs, in priority order:

1. **Establish what is true.** Verify every checkable claim against the code before recommending anything — the resolver chain, the catalogs, the build lineage, the naming history. A report written under old branding still describes our code; a report on a stale build describes a stale tree, and the diff between trees is part of the answer.
2. **Separate the verified from the unverifiable.** Runtime measurements we cannot reproduce are labeled as such — consistent, specific detail earns benefit of the doubt, and nothing more. A privacy or security claim is never acted on unverified; it escalates to the Council.

## Diagnose in the code, not in the thread

- **Match symptoms to the code's own confessions.** Screens and flows document their failure paths — a comment that admits a load can fail outright and leave the user sitting on a bare stage has already described the report. Read the actual screen before hypothesizing about it.
- **A hypothesis ships with its mechanism.** Content the accessibility tree can see but the eye cannot is opacity-gated animation state; a broken-image icon is a failed asset request; an error boundary is a throw in a handoff. Name the file and the reason, never just the hunch.
- **Isolate the reporter's variables before concluding.** A port forward, a locale, a dev build — each is a suspect until the reporter or the code clears it. Ask for the one-variable reproduction, not a vibe check.

## The response pattern

- **Acknowledge the specific symptom.** The reporter should know the report landed with someone who read it — mirror what they actually saw, not a generic apology.
- **State the honest diagnosis with its uncertainty.** What the code says, what could not be verified from here, and what would settle the difference.
- **Ask for artifacts, not adjectives.** Console errors, failed network requests, a reproduction with one variable changed at a time.
- **Note active work without promising dates.** If the flow is being reworked, say so; never promise a fix on a timeline.

## Case mechanics

- **Triage recommends; the Council files.** Nothing becomes a case without the Council's go — the Council holds end states and freeze orders no report can see.
- **The title is the case.** Titles must be self-contained within 500 characters and carry the user-visible stakes; detail rides a note on the case, never a second case.
- **Priority is the Council's weighting, recorded.** A case the Council calls super low gets filed super low, not dropped.
- **Close duplicates immediately.** Two cases for one truth corrupt the queue's order — the queue is worked top-down, and a duplicate is a lie about what is next.

## Provenance

Distilled from the 2026-11-21 rounds — a personal-mode configuration report and a welcome-screen bug report, both from the holonet. Update this file whenever a triage round reveals a broader lesson — same compounding rule as the other skills.
