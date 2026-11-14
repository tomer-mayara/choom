# Duplication assessment report contract

[interface-duplication.tsp](interface-duplication.tsp) owns the saved report.
[interface-duplication-codec.tsp](interface-duplication-codec.tsp) owns decoding
outcomes. Report version 1 supports baseline versions 1, 2 and 3. The viewer
reads saved judgments; it does not run a detector or fetch cited source files.

`decodeDuplicationReportYaml(text, baseline, baselineSha256)` reads strict YAML,
validates the report, and binds it to the loaded baseline's ID, format version
and original-byte SHA-256. The baseline input may be deeply read-only. A success
returns an owned report value. A failure returns a bounded message and one of
`invalid-encoding`, `unsupported-version`, `invalid-document`, `limit-exceeded`
or `baseline-mismatch`. Failed decoding does not change a workspace.

## Finding identity and judgments

Each finding records two supported public endpoints. An `interface-pair` groups
all observations for two different interfaces. Entry-level observations keep
their exact entry IDs within that finding. An `entry-pair` names two different
documented entries of the same interface in baseline version 2 or 3. Entry IDs
are local to an interface.
An interface paired with itself or its own entry is not a finding.

`duplicationFindingKey` includes baseline digest, snapshot ID and inventory
digest, finding kind, and canonical endpoint identities. The external producer
hashes this key for its stable finding ID. The viewer rejects repeated IDs and
canonical pairs even when a repeated pair uses a different ID. A/B and B/C do
not imply A/C. Observation evidence does not create more findings or decisions.

`needs-review` has no completed review provenance. A reviewed finding uses one
exclusive outcome: `potential-redundancy`, `justified-distinction`, or
`insufficient-evidence`. It retains its rationale and distinct worker/manager
identities. Potential redundancy needs an overlap claim and evidence. A justified
distinction needs decisive differences and evidence. Insufficient evidence names
the missing facts; its overlap can remain unknown. These checks validate saved
claims and references, not the truth of a semantic judgment.

Review counts are finding counts. `completed` cannot contain pending findings.
Scan counts for examined, excluded and unsupported inputs are source-file counts;
helper-only and unmapped counts are candidate-pair counts. Null means unknown.
An empty scan cannot claim successful completion. Incomplete scan states need
diagnostics. Review completion does not erase scan or mapping limits.

## Comparison facts and source references

Facts are optional. A `recorded-contract` fact references a supported field on
its endpoint. `resolveDuplicationRecordedFact` returns the saved value, status,
evidence references and acceptance reference without interpreting prose. A
`source-review` fact records a known value with evidence, an unknown value with
its gap, or an inapplicable topic with its reason. Unknown and inapplicable facts
have null values. Keep separate facts when source evidence and a baseline differ.

Every observation and fact must belong to its finding's public endpoints.
Foreign interfaces, foreign entries and unresolved baseline field references
are rejected. Version 1 has no entry IDs. Owners and display names come from the
bound baseline; unknown owners remain valid.

Version 3 retains version 2 documentation, including signatures and entry
interaction statements. Comparisons use those same saved fields and names.
Source-use assessments do not replace contract facts or change a duplication
judgment. A report still binds to the exact version and bytes of its baseline.

Source references use safe snapshot-relative paths, file SHA-256, positive
inclusive line ranges and evidence references. Their snapshot must match the
report. The external producer verifies files, ranges, hashes and registration.
The viewer validates saved shape and identity only; cited evidence is not loaded.

## Bounds and checks

The existing YAML reader enforces one document, 16 MiB of UTF-8 text, depth 32,
250,000 nodes, and its tag, anchor and JSON-data protections. Host readers enforce
the original-file byte limit before decoding. Reports allow at most 1,000 findings
and, per finding, 100 observations, 100 comparison facts and 100 source records.
These limits bound the selected finding's complex UI records. Text values use a 16-KiB UTF-8 limit;
identifiers, paths and references use 4 KiB. All string-value occurrences count
toward the 4-MiB metadata budget, including repeated values. No limit truncates
a report. A structural score is finite and in [0, 1]; a source review has no score.

Focused checks:

```sh
bun run test:behavior --tags @duplication-report-codec
bun test ./test/interface/lib/interface-duplication-yaml.test.ts ./test/interface/lib/duplication-report-limits.test.ts
bun test ./test/unit/domain/interface-duplication.test.ts
bun run check:contracts
```
