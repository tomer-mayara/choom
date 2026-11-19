# Working on TraceRelic

## Manager and workers

- **Manager.** The top-level agent owns the plan, cross-component decisions, and
  final review. Delegate implementation in bounded tasks. Give each worker its
  constraints and checks, with at most four workers active at once.
- **Workers.** Stay within the assignment. Report what changed, which checks
  passed or failed, and any blockers. Delegate further only when the manager asks.

Use lower reasoning effort for small tasks (for example, GPT-6.2 Astra Medium
in Codex). Claude agents also follow [CLAUDE.md](CLAUDE.md).

## Feature workflow

1. **Plan before coding.** The manager records all four constraint decisions,
   writes the changed constraints, and names their checks. Follow [New feature planning](docs/engineering-guidelines/new-feature-planning.md).
2. **Implement one scenario at a time.** Workers follow the written constraints
   and use red–green–refactor at each relevant test level. Follow [Coding principles](docs/engineering-guidelines/coding-principles.md).
3. **Review the combined change.** The manager compares the result with the plan,
   runs the affected checks, and reports the results and any remaining gaps.

Preserve unrelated local changes. Use plain language in docs, tickets, and
comments, following ASD-STE100 where practical.

When the user requests a PR, open a draft with the problem, result, contract
changes, and check results. If asked to mark it ready, review the full diff
first. If asked to merge, verify the required checks and reviews have passed.
