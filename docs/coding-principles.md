# Coding principles

Use these principles to make software easier to understand, change, and verify.
They apply to functions, objects, data, and systems that combine them. Choose
structure from the behavior and constraints of the problem. A class count,
function length, or design pattern does not establish good design.

Follow the [new feature cookbook](new-feature-cookbook.md) for feature constraints,
artifact links, human approval, and CI enforcement. It takes priority if these
three guides conflict. This document covers design and testing within those
constraints. For implementation practices, read
[coding standards](coding-standards.md). For work rules and verification commands,
follow [AGENTS.md](../AGENTS.md).

## Start with behavior and invariants

State what a caller or user must observe before choosing a structure. Describe
accepted inputs, outputs, failures, and important constraints. Include behavior
under empty input, invalid input, partial failure, and repeated use when relevant.
An invariant is a condition that must remain true, such as a balance that cannot
be negative or a resource that has one owner.

Put each invariant where all operations that can break it must pass. Avoid a
design that depends on every caller remembering the same validation or sequence.
Distinguish domain rules from transport formats and storage details. This helps
the rules remain clear when an external system changes.

Production code is in root `src/`, `src-tauri/src/`, and `packages/*/src/`.
Apply the BDD, TDD, and test guidance below to frontend, Rust, and Bun package
behavior. Use the appropriate native or browser test environment. For
scripts, documents, configuration, and tooling, use relevant build, type, lint,
and manual checks instead of adding implementation tests. Feature constraint
artifacts and review still follow the cookbook, regardless of which files
implement the change.

For new or changed production behavior, first write failing BDD acceptance
scenarios in Gherkin, stored in Cucumber `.feature` files. Use Given-When-Then to
describe observable outcomes through public interfaces. Then use TDD for the
behavior and contracts that the scenarios need: write a focused failing test,
make it pass, and refactor with tests green. Continue until the Cucumber scenarios
and affected acceptance checks pass. Other tests supplement the Cucumber feature
files required by the cookbook.

For a source refactor that must preserve behavior, establish passing
characterization coverage before changing structure. Record important existing
outcomes, including failure behavior. Do not break an unchanged acceptance case
to create a false red step. If an existing defect must change, specify that
change separately. Test observable results and meaningful contracts; do not
freeze private call sequences unless their order affects required behavior.
Follow the cookbook for changes to observability, dependency rules, or interface
contracts even when user-visible behavior stays the same.

## Test types

- **Unit tests:** Verify focused behavior within one Choom workspace. Replace
  other Choom workspaces with test doubles at their public interfaces. Real
  collaboration within the workspace is allowed. Type-only contract imports
  run no production behavior and are allowed.
- **Integration tests:** Verify real collaboration between two or more Choom
  workspaces through public interfaces. A fast, single-process test can still
  be an integration test.
- **Interface tests:** Verify one public interface or data contract: accepted
  inputs, outputs, data formats, events, and errors. Keep these tests few and
  focused. Real collaboration across workspaces makes a test an integration test.
- **Acceptance tests:** Specify user-required behavior through public interfaces
  in an environment similar to production. Check observable outcomes against
  the acceptance criteria. These tests can span workspaces.

Cucumber feature files define behavioral constraints. Test categories describe
what their step implementations and other suites exercise; the runner alone does
not determine a category. Keep feature files at the artifact paths linked from
the owning `component.yaml`. The test directories below organize test code.

Place TypeScript tests with the root app or workspace whose behavior they verify,
in `test/unit/`, `test/integration/`, `test/interface/`, or `test/acceptance/`.
Within each category,
use the corresponding source component path, such as
`test/unit/reader/panels/` for `src/reader/panels/`. Place a mixed suite under its
main workflow owner or shared component group. Do not split a coherent suite
only to mirror every source file. Create folders when they have suites; empty
placeholder directories are not required. See the
[project structure](../README.md#project-structure) for the current components
and suites. Keep Rust unit tests with their modules and Rust
integration tests under `src-tauri/tests/` when needed.
Keep shared fixture data, drivers, and test doubles outside the category folders
and separate from production code.

Classify the behavior exercised, including calls through helpers and production
dependencies. Runtime collaboration across Choom workspaces makes a focused test
integration; real filesystem use or third-party libraries alone do not. A public
function call alone does not make a focused rule test an interface test. Reserve
interface suites for explicit boundary contracts. Acceptance checks a required
user outcome; a Given-style name alone is not enough. Synthetic saved data can
support acceptance when it goes through the real production boundary.

Keep an existing mixed suite in the category that covers its real collaboration
or acceptance journey. Do not add doubles or weaken assertions just to put it in
unit. Document focused commands in the owning app or workspace. The current
Bun native runner scans `test/unit/` for TypeScript suites and excludes
`*.test.tsx`. The separate DOM runner selects React suites with `test/preload.ts`.
`test:e2e` builds once and runs browser Cucumber acceptance using Playwright;
`test:behavior` runs the browser-free Cucumber profile. Both use feature files
under `cookbook/behavior/` and shared steps in `test/steps/`. Include new
suite locations in the appropriate runner and the complete test command.
Keep native Bun and DOM tests in separate processes. Rust behavior
uses `bun run test:rust`; desktop
acceptance must exercise the assembled app route.

## Make code explain its work

Use names that describe domain meaning and effects. A reader should understand
what an operation promises without tracing every helper. Keep functions focused
on a clear task, and keep the steps within a function at a consistent level of
detail. Separate a decision from its mechanics when this makes either easier to
understand or test.

Extract a helper when it gives a coherent operation a useful name or separates
knowledge that changes for a different reason. Do not split code only to reach a
line limit. Too many tiny helpers can hide the flow as easily as one large function.
Keep comments for reasons, constraints, and tradeoffs that the code cannot show.
Remove comments that repeat the code or describe behavior that no longer exists.

## Give knowledge a cohesive owner

Put decisions close to the facts they need. A caller should ask for a useful
answer instead of reading several mutable structures and reconstructing the
owner's rules. Group behavior that changes for the same reason. Separate behavior
that has different rules, dependencies, or lifetimes.

An object is useful when it owns information, enforces an invariant, coordinates
a lifecycle, or offers a clear collaboration role. A stateless role can also be
useful. It does not need a second implementation to justify its existence; it
needs a clear purpose and a useful contract. Prefer messages that express work
over accessors that expose representation for clients to manipulate.

Use records for data that callers need to inspect or transfer. Use free functions
for calculations and bounded operations that need no object identity. Use
closures when they give state a clear local lifetime. None requires a class
wrapper. Records can remain valid results from objects. Keep mutation authority
clear: a read-only property does not make its nested values immutable.

## Make effects and lifetimes explicit

Separate calculations from external effects where this makes reasoning easier.
Identify operations that change supplied data, write storage, use the network,
read a clock, or collect reports. Do not call a helper pure if it has these
effects. Make required dependencies and effects visible in its contract or name.

State should live as long as the work that needs it. Keep operation state out of
reusable services unless sharing is required. Identify who creates, uses, and
releases each resource. Ensure cleanup on success, failure, and cancellation.
Do not let an object become usable before its required state is valid.

For concurrent work, state which values are shared and which are isolated. Define
the consistency rule for shared updates and use the appropriate transaction,
lock, ownership model, or immutable value. Do not assume that one process or an
asynchronous API prevents races. Test repeated and concurrent use when isolation,
ordering, or duplicate work affects the contract.

## Design boundaries that protect callers

Validate untrusted input at the boundary where it enters. State units, encoding,
optional values, and limits in data contracts. Translate external formats into
internal values when that keeps domain code independent of transport details.
Return useful results without exposing mutable internal state by accident.

Make failure behavior deliberate. Distinguish invalid input, expected absence,
temporary external failure, and violated invariants when callers need different
responses. Preserve causes and context. Avoid swallowing errors or returning a
success-shaped partial result unless the contract permits it. Use retries only
when failure is recoverable and repeated effects are safe or controlled.

Treat authorization, sensitive data, and resource use as behavior requirements.
Check access where the protected operation occurs. Avoid secrets in logs and
error messages. Bound work that untrusted input can trigger. Set appropriate
timeouts and cancellation behavior. Test these rules through the relevant public
boundary, including failure and limit cases.

## Direct dependencies deliberately

A module should depend on collaborators whose responsibilities it can explain.
Keep core rules independent of volatile infrastructure when this reduces change
cost. At those boundaries, infrastructure depends on the contracts the core
rules need; core rules do not name infrastructure types. Place translation and
orchestration there so external details do not spread through the system. Add
layers or adapters only when they serve this purpose.

Use a narrow interface when clients need a role contract or when a boundary needs
independent verification. Do not add an interface, factory, or dependency injection
framework for every concrete type. Prefer explicit composition over hidden global
dependencies. Use inheritance only when a subtype can honor the complete parent
contract, including failures and invariants. Ordinary conditions can express real
variation without a subtype hierarchy.

When repeated branches select work by type, and DRY3 shows that they express the
same role, consider a common message implemented by the variants. This can let
clients request work without knowing which variant performs it. Check that the
variants share a contract before replacing the branches. This sharing rule does
not require three implementations before an object can have a useful role.

## Share proven concepts and keep abstractions simple

Follow DRY3: introduce shared behavior after the third copy, not before. Check
that the copies share meaning and change for the same reason. Similar syntax
alone does not prove a common contract. Preserve differences in ordering,
ownership, limits, and error behavior.

Prefer the smallest abstraction that serves current requirements. Avoid flags,
hooks, and general frameworks for imagined future callers. If a shared abstraction
accumulates exceptions or forces unrelated callers to change together, reconsider
it. Restoring duplication can be a useful step toward finding the right boundary.

## Change and verify in small steps

Make one coherent change at a time. Separate structural changes from behavior
changes when possible so failures remain easy to explain. Remove obsolete paths
and update affected documents in the same change. Keep public compatibility
deliberate rather than preserving accidental internal access forever.

Measure performance before adding complexity. Define a relevant workload and
budget, find the limiting work, and compare the result after the change. Preserve
behavior while optimizing. Include memory, resource limits, and worst-case inputs
when they matter; average speed alone can hide an unsafe cost.

Run changed tests and required checks on the complete candidate. Use focused tests
for local rules, contract tests for boundaries, and tests with real collaborators
for behavior that doubles cannot establish. Acceptance coverage must show that
the user requirement is met. Use the test definitions above and the verification
rules in [AGENTS.md](../AGENTS.md). For feature changes, also complete the
[cookbook PR checklist](new-feature-cookbook.md#pr-checklist). Passing tests support
a claim within their scope; they do not prove every property of the system.

## Further reading

These primary sources inform the design guidance. Their authors did not review
or endorse this document.

- Robert C. Martin, [Objects and Data Structures](https://blog.cleancoder.com/uncle-bob/2019/06/16/ObjectsAndDataStructures.html)
  and [Functional Classes](https://blog.cleancoder.com/uncle-bob/2023/01/18/functional-classes.html).
- Sandi Metz, [What does OO afford?](https://sandimetz.com/blog/2018/21/what-does-oo-afford)
  and [The Wrong Abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction).
