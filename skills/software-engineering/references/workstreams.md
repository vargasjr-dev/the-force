# Workstreams

Plan-doc conventions, Linear integration, and the workstream record template. A workstream is a multi-PR effort — usually a feature or refactor that ships across days/weeks and multiple Linear tickets.

## Rules

1. **A plan doc aligns on key decisions.** It's a tool to get a fast "yes" or feedback from a reviewer, not an implementation spec. Concise, opinionated, decision-focused.

2. **Don't dump implementation code in plans.** No 200-line TypeScript listings. If someone needs the code, they'll read the PR. Light pseudocode only when it clarifies a non-obvious mechanism.

3. **No "v1" / "v2" language.** Write the plan for what we're building now. If something is out of scope, say "out of scope" — don't frame it as a future version.

4. **Lead with the beachhead use case.** Pick the most compelling, realistic scenario that motivates the feature. Then choose examples that match it — if the feature is for app builders, show app-builder examples, not webhook examples.

5. **Cut redundant sections.** If a section doesn't add information the reader doesn't already have, delete it. Architecture diagrams included — most of the time they don't earn their space.

6. **Decisions over descriptions.** Tell the reader *what you chose and why*. Vargas already has codebase context; don't re-explain it.

7. **Every workstream gets a Linear Project.** Under Team Atlas (`ATL`) by default. The Linear project is NOT the source of truth — the internal plan markdown in the workstream record is. Linear gives teammates visibility.

8. **Every task gets a Linear ticket.** Each task line in the plan points to a Linear issue. That's the link between our internal tracking and what the rest of the team sees.

9. **Don't backport conventions.** Existing workstreams don't need to be retrofitted to meet these standards. Update them one at a time as they become relevant.

10. **Close the loop on merge.** When a PR merges, close the corresponding Linear ticket and move the task to the `## Completed` section. What's at the top = what's next.

## Plan template

When creating a new workstream record under `/workspace/data/apps/workstream-command-center/records/`, use this scaffold:

```markdown
# {Workstream Name}

**Linear Project:** [{Project Name}]({linear-project-url})

## Active
- [ ] {Task title} — [{ATL-XX}]({linear-issue-url}) — [PR #{number}]({pr-url})
- [ ] {Task title} — [{ATL-XX}]({linear-issue-url}) — [PR #{number}]({pr-url})

## Up Next

### {Phase/Section Name}
{Brief description of what this phase accomplishes and why.}

- [ ] {Task title} — [{ATL-XX}]({linear-issue-url})
- [ ] {Task title} — [{ATL-XX}]({linear-issue-url})

### {Next Phase/Section}
- [ ] {Task title} — [{ATL-XX}]({linear-issue-url})

---

## Completed
- [x] {Task title} — [{ATL-XX}]({linear-issue-url}) ([PR #{number}]({pr-url}) merged)
```

The `## Active` section drives the Slack Home Tab. Anything tracked there auto-renders for the team to see. Keep it tight — only items genuinely in flight.
