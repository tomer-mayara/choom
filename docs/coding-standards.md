# Coding standards

Choom uses TypeScript, React 19, Vite, Tailwind CSS v4, and Tauri v2 with a Rust
backend. Bun manages the workspaces and compiles the desktop LLM host with its
runtime for packaging. The host uses the backend LLM library. ESLint
checks TypeScript and TSX through `.habit-hooks/eslint.config.mjs`; run
`bun run check` to find issues. There is no `fix` script. Review any manual or
automated edits in the resulting diff.

Read [coding principles](coding-principles.md) for design and testing guidance.
Follow [AGENTS.md](../AGENTS.md) for workflow and verification.

## TypeScript and JavaScript

- Use explicit parameter and return types when they make a contract clearer.
- Prefer `unknown` to `any`. Narrow types before use; avoid unsafe assertions.
- Use `as const` for literal types where useful. It does not freeze nested data.
- Use names that explain values. Name constants when a number has domain meaning.
- Use `const` by default and `let` when reassignment is needed. Do not use `var`.
- Prefer optional chaining and nullish coalescing when their behavior fits the
  contract. Do not treat a missing value as equivalent to zero or an empty string.
- Use `for...of` for iteration when it makes the flow clearer.
- Await promises whose results or failures the operation must handle. Return a
  promise directly when no local handling or cleanup is needed.
- Do not use an async function as a Promise executor. Use `try`/`catch` only when
  it adds context, recovery, or a deliberate error response.
- Throw `Error` objects with useful messages. Remove temporary debug statements.

## React and shared UI

- Use function components. Define components outside other components.
- Call hooks at the top level and include the dependencies each hook uses.
- Use stable item IDs as list keys when available.
- Pass children as nested JSX. With React 19, prefer a ref prop to `forwardRef`.
- Keep app-owned UI primitives in `src/components/ui/` and theme styles in
  `src/index.css`. Introduce a shared UI package when real consumers justify it.
  Import existing packages through their declared exports.
- Use semantic HTML, useful image alt text, a clear heading order, and labels
  for inputs. Ensure interactive controls work with a keyboard.
- Give loading, empty, and error states clear behavior. Use responsive image
  sizes and dimensions when appropriate. Use the existing Vite setup; the app
  has no router.

## Boundaries and security

- Validate untrusted input at Tauri commands, process calls, and other external
  boundaries. Keep input and output contracts clear; TypeScript alone does not
  validate data.
- Read configuration at its owning boundary and pass explicit settings to
  collaborators. Keep secrets out of frontend code, `VITE_*` variables, logs,
  and committed files.
- Avoid `dangerouslySetInnerHTML`; if required, use a suitable sanitizer for
  untrusted content. Do not use `eval()`.
- Use `rel="noopener"` for links with `target="_blank"`.
- Handle failures deliberately. Do not catch and discard errors or turn a
  failed operation into an apparent success.

## Local implementation checks

Group source files by cohesive component in root `src/`, `src-tauri/src/`,
and each package's `src/` directory. Keep a component's helpers beside it; create
a separate folder when the code has a distinct responsibility. Keep framework entrypoints and generated
files at their configured locations. See the [project structure](../README.md#project-structure)
and [LLM package API](../packages/llm/README.md#public-api) for current owners and
boundaries. Update package exports and callers when moving files.

Keep imports specific where practical. Avoid re-export files that expose an
entire package without a clear public contract. Check the cost of work inside
loops; avoid repeatedly copying a growing accumulator.

In tests, put assertions in `it()` or `test()` blocks, use async/await for async
work, and keep suites easy to navigate. Do not add `.only`, `.skip`, or `.todo`
markers to committed tests.

Automated checks cover mechanical rules. Review behavior, accessibility, error
paths, dependency boundaries, and user experience as well.

For Rust changes, use the Cargo formatting and Clippy commands in the
[README](../README.md#configuration-notes), plus behavior tests and the relevant
desktop build. TypeScript lint and type checks do not check Rust.
