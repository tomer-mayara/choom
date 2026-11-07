# R03: one owner for safe semantic messages

Date: 7 November 2026. Base: R02 commit
`80d5272ca8fe26b87b510fffd44b260c8bcf8fa9`. This implements R03 in the
[agreed plan](2026-11-07-agreed-refactoring-plan.md).

## Result and constraints

[semantic-validation-messages.ts](../../src/domain/semantic-validation-messages.ts)
owns the 23 named messages and their explicit priority. Validators and the YAML
codec use those references. The original message text and priority compare
exactly with the base. The codec still classifies unsupported versions first,
then chooses a known semantic explanation, then a fixed unknown-field or generic
schema fallback. Parser and unexpected-exception fallbacks are unchanged.

| Constraint | Treatment |
| --- | --- |
| Behavioral | Preserve accepted documents and exact rejection messages. Add passing characterization before changing production structure; no new product behavior or artificial failing acceptance step. |
| Observability | Failure stages, codes, durations, safe messages, and unmeasured OpenSLO are unchanged. |
| Architecture | The catalog belongs to the semantic domain and has no imports. The codec depends on it. No new component, package, error class, or issue-ID framework. |
| Interface / TypeSpec | Document and failure shapes are unchanged. Existing generated-schema conformance remains. No new serialized contract or generated edit. |

## Characterization and coverage

Before the refactor, the affected domain/codec unit and interface suites passed
156 tests with 404 assertions. They passed unchanged after the substitution.
The new cases cover:

- Simultaneous invalid configuration path, duplicate component name, and
  incorrect evidence ownership. The duplicate-name explanation wins even though
  schema traversal encounters the path issue first.
- Unknown fields and structurally invalid values containing private-looking
  markers. Both encode and decode return their fixed safe fallback.
- Malformed YAML and an encoding input that throws. Neither returns parser
  details nor the raw exception message.

The [T02 domain](../../cookbook/behavior/architecture-import/t02-domain.feature)
and [T06 API](../../cookbook/behavior/architecture-import/t06-api.feature)
characterization still covers declared ownership and portable documents. The
[T02 model](../../cookbook/behavior/architecture-import/t02-model.feature),
[T06 document](../../cookbook/behavior/architecture-import/t06-documents.feature),
and [T07 workflow](../../cookbook/behavior/architecture-import/t07-workflows.feature)
browser cases cover semantic rejection, source-free reopening, multi-directory
ownership, and preserving the current diagram on failure. Exact diagnostic
selection is checked through the public codec; no new screen behavior is claimed.

Focused commands:

```sh
bun test ./test/unit/domain ./test/unit/lib/architecture-yaml.test.ts ./test/interface/domain ./test/interface/lib
bun run test:behavior:native --tags '@cr-001-t02-domain or @cr-001-t06-api'
bun run test:e2e --tags '@cr-001-t02 or @cr-001-t06 or @cr-001-t07'
```

## Verification scope

Local validation uses Bun 1.4.4 and Node 26.13.0 on macOS arm64. The focused native
behavior run passed 32 scenarios / 143 steps. Full local results and independent
review are recorded below; the draft PR records current CI status. Native code,
installed UI drivers, and runtime discovery are unchanged. The platform limits in
[T08](../change-requests/CR-001-T08-evidence.md) remain; browser simulations alone
do not prove installed behavior.

| Check | Result |
| --- | --- |
| `bun run check` | Passed: 344 native unit tests, 17 DOM tests, 158 Cucumber scenarios / 730 steps, 85 interface tests, and all static, cookbook, and contract checks. |
| `bun run check-types` | Passed. |
| Focused browser command above | Passed: frontend build and 45 scenarios / 366 steps. Existing chunk-size and browser-fixture import warnings remain. |
| Independent review | Exact message/order comparison and validator substitution comparison passed; 30 codec unit/interface tests with 146 assertions passed. No actionable finding. |
| `bun run habit-hooks --all` | Passed; snooze file remains empty. |
