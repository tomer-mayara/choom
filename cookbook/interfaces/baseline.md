# Baseline validation

The architecture-model component owns the baseline viewer profile in
[baseline.tsp](baseline.tsp). `baselineSchema` in
[`src/domain/baseline.ts`](../../src/domain/baseline.ts) validates an unknown value
and returns the generated `Baseline` data type. Use `safeParse` to get field paths
for invalid input. The viewer no longer accepts the legacy diagram format.

The generated schema checks field shapes, nonblank text, statement statuses,
acceptance references, and list sizes. The runtime validator also checks item ID
uniqueness, component references, parent cycles, and safe membership selectors.
Selectors are relative paths or subtrees ending in `/**`. Exact paths and
exclusions are retained; validation does not match them against source files.

Accepted statements require an `acceptanceRef`; proposed statements cannot have
one. All statements require at least one nonblank evidence reference. The viewer
does not resolve evidence, acceptance records, or `parentId`. Validation neither
accepts a proposal nor proves its evidence, ownership, or rules.

All four collections are required and may be empty. Names may repeat. An
interface can have unknown ownership and known consumers. Empty consumer lists
are invalid; null means that the complete positive policy is unknown. A component
parent can be absent or a statement whose value is null. These forms remain
distinct.

Rule values are JSON objects or null. Keep nested values and all own keys,
including `__proto__`, without running expressions. Reject non-JSON values and
cycles. No field is silently discarded. Byte and YAML limits belong to the
[input boundary](baseline-codec.md); display limits belong to the
[workspace](workspace.md).

The two reviewed fixture files live in `test/fixtures/baseline-viewer/`. They are
copies of the reviewed empty and full `work-choom` baselines. Tests use repository
paths and need no external checkout or companion records.

Run the focused checks:

```sh
bun run test:behavior --tags @bv-01
bun test ./test/unit/domain/baseline.test.ts
bun test ./test/interface/domain/baseline.test.ts
bun run check:contracts
```

The feature and TypeSpec contract are linked from the domain component manifest.
The existing runners discover the new feature, steps, and suites. This change
adds no cross-component dependency or production service, so the architecture
and OpenSLO artifacts remain unchanged.
