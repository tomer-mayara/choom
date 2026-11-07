# Coding standards

Choom uses TypeScript, React 19, Vite, Tailwind CSS v4, and Tauri v2 with a Rust
shell. Bun manages dependencies and unit tests; Node runs development tooling.
Tauri packages the frontend and Rust shell. ESLint
checks TypeScript and TSX through `.habit-hooks/eslint.config.mjs`; run
`bun run check` to find issues. There is no `fix` script. Review any manual or
automated edits in the resulting diff.

Follow the [new feature cookbook](new-feature-cookbook.md) for feature constraints,
artifact links, human approval, and CI enforcement. It takes priority if these
three guides conflict. Apply these implementation standards within its
constraints. Read [coding principles](coding-principles.md) for design and testing
guidance. Follow [AGENTS.md](../AGENTS.md) for work rules and verification.

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
  `src/styles.css`. Introduce a shared UI package when real consumers justify it.
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
- Author Choom-owned component contracts in TypeSpec. Regenerate their checked
  TypeScript/schema outputs after changing the source; do not edit generated
  files by hand. Preserve runtime validation and test implementation conformance,
  including errors and cancellation. Vendor Tauri configuration keeps its own
  schema.
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
for current owners and boundaries. Update package exports and callers when moving files.
Keep affected `component.yaml` artifact and child references current, following
the [cookbook linking rules](new-feature-cookbook.md#linking-file).

Keep imports specific where practical. Avoid re-export files that expose an
entire package without a clear public contract. Check the cost of work inside
loops; avoid repeatedly copying a growing accumulator.

In Bun and Playwright suites, put assertions in `it()` or `test()` blocks.
Use the runner's assertion syntax for Cucumber steps and Rust tests.
Use the runner's async support, await asynchronous work, and keep
suites easy to navigate. Do not commit focused, skipped, or pending tests, such
as `.only`, `.skip`, or `.todo` markers.

Automated checks cover the properties they exercise. Review behavior,
accessibility, error paths, dependency boundaries, and user experience as well.
Complete the [cookbook PR checklist](new-feature-cookbook.md#pr-checklist) for
feature changes; human approval of changed constraint artifacts remains required
before merge.

For Rust changes, use the Cargo formatting and Clippy commands in the
[README](../README.md#development-commands), plus behavior tests and the relevant
desktop build. TypeScript lint and type checks do not check Rust.
