# Work in Choom

## Approach

The top-level agent is the manager: plan, delegate, review, and sign off the
complete change. Usually delegate implementation. Take the lead on work that
needs a view of the whole system. Use 0 to 4 subagents at one time.

- Subagents do only the assigned work. Do not start another subagent unless the
  manager asks.
- Use a smaller model for small work, such as GPT-6.1 Sol. Claude agents also
  follow `CLAUDE.md` when that file exists.
- Give each worker the applicable repository rules. Review each worker's result.
- Use simple language in documents, tickets, and code comments. Follow
  ASD-STE100 where practical; strict conformance is not required.
- Preserve unrelated local changes. Keep the change within the requested scope.

## Repository guidance

Choom uses Bun, Vite, React, TypeScript, and Tauri. The frontend is in `src/`
and the Rust shell is in `src-tauri/src/`. Add workspaces under `packages/`
when the application needs them. Read [README.md](README.md) for setup and commands,
[coding principles](docs/coding-principles.md) for design and testing, and
[coding standards](docs/coding-standards.md) for TypeScript and React practices.
Apply these guides during implementation and review.

## Behavior and tests

For new or changed production behavior in `src/`, `src-tauri/src/`, or
`packages/*/src/`, follow the mandatory BDD/TDD sequence and characterization guidance in
[coding principles](docs/coding-principles.md#start-with-behavior-and-invariants).
Apply its DRY3 rule and test definitions during implementation and review.

Run `bun run test` for the complete Bun unit suite. It runs `test:native`
for TypeScript suites under `test/unit/`, then `test:dom` for React suites with
`test/preload.ts` in a separate process. Keep DOM globals out of native tests.
Run `bun run test:behavior` for Cucumber constraints and `bun run test:e2e`
for browser Cucumber acceptance through `test/steps/`. Install Chromium with
`bunx --no-install playwright install chromium` before the first browser run.
Use `bun run test:rust` for Rust behavior. Verify the assembled desktop route
through packaged acceptance separately. Put root or workspace TypeScript suites in `test/unit/`,
`test/integration/`, `test/interface/`, or `test/acceptance/`, using the test definitions in coding
principles. Within each category, group suites by the corresponding `src/`
component path. Keep mixed suites at their shared component group or main
workflow owner. Shared fixtures and helpers stay outside those category folders.
When adding production behavior, add suitable tests and document focused commands.
Do not claim that lint, type checks, or a build verifies behavior. Do not add
behavior tests for scripts, documents, configuration, or tooling; use relevant
build, type, lint, and manual checks.

## Verification

Select checks from the complete change, including shared callers and consumers.
Run each new or changed test locally before committing. For production changes,
run the affected behavior tests, `bun run check`, `bun run check-types`, and the
relevant build. Use `bun run build` for the frontend. For
Rust changes, also run Cargo tests, formatting, and Clippy; use
`bun run desktop:build` when native packaging or the assembled desktop route
changes. See [README.md](README.md) for commands and platform prerequisites.
For documents, inspect the text and links. For configuration and tooling, run
the relevant checks and verify the changed operation.

Run `bun run habit-hooks --all` on the complete candidate. See
[README.md](README.md#habit-hooks-scans) for prerequisites and focused scans.
Correct enforced findings or record why a finding remains. Keep the snooze file
empty. Report checks run, results, and any environment limits or deferred checks.
Update affected documents in the same change.

## Pull requests

When a pull request is requested, open it as a draft. Describe the problem,
result, relevant design or contract changes, validation, and unresolved limits.
The manager reviews the complete candidate before it becomes ready for review.
Keep evidence current after fixes. Do not mark Ready or merge beyond the user's
requested scope. Merge only after the applicable checks and required repository
reviews pass.
