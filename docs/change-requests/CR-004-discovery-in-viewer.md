# CR-004: Show discovery questions and gaps in the viewer

**Status:** Approved. The owner approved the direction on 2026-11-15
(decisions D17 and D20 in the
[Step 1 gap report](../architecture-reviews/2026-11-15-step-1-gap-surplus-report.md#decision-log)),
and approved this text with ticket GA-11b on 2026-11-16.

**Date:** 2026-11-15

**Scope:** The browser and desktop viewer, the discovery record that the manual
producer saves at Stage 6, and the analysis design's "Report views" and
"Compatibility" sections.

## Goal

Step 1 of the [analysis design](../design/llm-led-architecture-analysis.md#step-1-establish-the-architecture-baseline)
saves two records: a baseline and a discovery result. The viewer opens only the
baseline. So a reader cannot see the questions about intent, the gaps, or the
deferred code that the discovery result records. The design's "Report views"
section asks the Baseline view to show these items. Its "Compatibility" section
says that the viewer loads no evidence. The two sections conflict.

This change lets a reader attach one discovery result to the open baseline. The
viewer then shows the recorded questions and gaps beside the items they name.
The viewer still loads no evidence, runs no checks, and changes no file.

The [viewer plan](../design/cr-baseline-viewer-plan.md#release-scope) excludes
model editing and statement acceptance. This change keeps that rule. Instead of
an editor, the viewer can copy a decision-file entry. The producer records the
decision and makes the next baseline version (tickets GA-01a and GA-01b).

## What the viewer reads

The reader selects one discovery file with **Open discovery result**. The viewer
reads that file only. It does not open the files that the discovery result
refers to (`runRef`, `codeMappingRef`, `entryAnalysisRef`, `dependenciesRef`,
`resourceAccessRef` or evidence references).

### Binding to the open baseline

A discovery result must name the exact open baseline. The viewer uses the same
rule as the [duplication report](CR-002-duplicated-interface-detection.md#loading-and-view-lifetime):
it compares the baseline ID and the SHA-256 digest of the original baseline file
bytes. The viewer already computes that digest when it reads a baseline.

Discovery `formatVersion: 1` records `baselineRef` (an ID) but no digest. IDs such
as `baseline-001` repeat across runs, so an ID alone can match the wrong
baseline. This change adds discovery `formatVersion: 2`:

| Field | Meaning |
| --- | --- |
| `baselineRef` | The ID of the fixed baseline, as today. |
| `baselineDigest` | New. The SHA-256 of the fixed `baseline.yaml` file bytes, as 64 lowercase hexadecimal characters. |

All other version 1 fields stay the same. The viewer refuses a version 1
discovery result. To show an older run, make a new run with a producer that
writes version 2. Stage 6 is save-only, so an old result cannot be upgraded in
place.

The built-in example has no file digest. It cannot have a discovery result,
which is the same rule as for the duplication report.

### Fields the viewer checks

The viewer checks the whole top-level shape of a version 2 discovery result:
exactly the field names in the
[record format](../design/app-a/record-format.md#discovery), plus
`baselineDigest`. It checks these fields in detail:

- `formatVersion`, `kind: architecture-discovery`, `baselineRef` and
  `baselineDigest`.
- `questions`: each has `id`, `subjectRefs`, `text` and `evidenceRefs`.
- `gaps`: each has `id`, `kind`, `subjectRefs`, `reason` and `evidenceRefs`.
- IDs are unique across questions and gaps.

The viewer does not interpret the other fields. A gap `kind` that the viewer does
not know stays readable and shows its recorded text.

## What the viewer shows

### Place each question and gap

A subject reference names a baseline item when it equals the item's ID, or when
it starts with the item's ID and a dot (for example `billing.purpose`). This is
the rule that the producer uses. Items of all four kinds can be named:
components, interfaces, resources and rules.

- A question or gap appears on every item that it names.
- A component shows a badge with the number of recorded questions and gaps that
  name the component or one of its fields. Questions and gaps about its
  interfaces appear in those interfaces' details, not in the component badge.
- A subject reference that names no baseline item goes to an **Unplaced** list,
  with its recorded text. Examples are a file ID or a path. The viewer never
  refuses a discovery result because of an unknown subject reference.
- Gaps of kind `deferred` appear in their own group, which the reader can
  collapse.

### Use exact words

The question and gap lists keep their history. A later note can answer an earlier
question, but the record of the earlier question stays. So the viewer:

- says **recorded questions** and **recorded gaps**, never "open" or "unresolved";
- says that these are items to review, **not defects**;
- says **No discovery result attached** when none is attached. It does not say
  "no questions".

### Copy a decision

Each statement in the details panel can offer **Copy decision**. It copies a
decision-file entry for that item and field, in the format that ticket GA-01a
defines. The copied text starts with a YAML comment that names the baseline ID
and digest, so that the reader can put the entry in the right decision file.
The viewer does not save a file and does not change the open baseline. This
action becomes available when GA-01a defines the decision format.

## Load and view lifetime

Use the duplication report's rules:

- One file load is active at a time, with explicit Cancel and Retry.
- The viewer checks the file completely, then attaches it in one step.
- A wrong ID or digest, an invalid file, a read failure, a cancellation or an
  exceeded limit keeps the open baseline and any discovery result already
  attached.
- A late result from an older load is ignored.
- Opening another baseline removes the attached discovery result.
- **Remove discovery result** removes only the discovery result.

A duplication report and a discovery result can be attached at the same time.
They are independent.

## Limits

The viewer applies these bounds before it shows a discovery result. It refuses a
larger file with a useful message. It never drops records to make a file fit.

| Limit | Bound |
| --- | --- |
| Selected file | 16 MiB, with the existing parser limits (depth 32, 250,000 nodes) |
| Questions and gaps together | 5,000 records |
| Subject references | 100 per question or gap |
| Text value | 16 KiB of UTF-8 bytes |
| IDs and references | 4,096 UTF-8 bytes each |
| Total metadata | 4 MiB, counted as for the duplication report |

## What does not change

- Baseline formats 1–4 stay the same.
- The viewer does not load evidence, follow references, run checks, write files,
  or change a statement's status.
- The installed viewer gets no new native capability: it still only reads files
  that the reader selects.
- The producer's completion checks stay in the producer.

## Producer work

- Stage 6 writes discovery `formatVersion: 2` with `baselineDigest`, the digest
  of the fixed baseline that it saves.
- `verify` checks that `baselineDigest` matches the saved baseline file.
- Update the [record format](../design/app-a/record-format.md#discovery) and the
  Step 6 cookbook.

## Delivery

Ticket GA-11b in the
[Step 1 gap report](../architecture-reviews/2026-11-15-step-1-gap-surplus-report.md#ga-11b-viewer-shows-discovery-questions-and-gaps)
implements this change. It starts with the acceptance scenarios that the report
lists. The **Copy decision** action needs GA-01a first.

GA-11b has two parts. GA-11b1 does the producer work above. GA-11b2 does the
viewer work:

- The [acceptance scenarios](../../cookbook/behavior/baseline-viewer/discovery-result.feature)
  open a discovery result, refuse a result for another baseline file, and copy a
  decision.
- [discovery-result.tsp](../../cookbook/interfaces/discovery-result.tsp) is the
  contract of the part that the viewer reads. `validateDiscoveryResult` in
  `@choom/baseline-model/discovery-result` checks a result against a saved
  baseline file: the kind, version 2, the fields, the limits, the unique IDs, and
  the baseline ID and digest. Stage 6 of the producer runs the same check on the
  fixed discovery result before it saves a file, and `verify` runs it on the
  saved file. Stage 6 also reads the exact bytes of the file with the bounded
  YAML reader of the viewer, before it saves a file and at `verify`, so the
  producer never publishes a result that the viewer refuses.
- `src/lib/discovery-result-yaml.ts` reads the selected file with the bounded YAML
  reader of a baseline, with the outcomes of
  [discovery-result-codec.tsp](../../cookbook/interfaces/discovery-result-codec.tsp).
  `src/lib/discovery-placement.ts` places each question and gap on the items that
  it names.
- `LoadWorkflow` in `src/architecture/load-workflow.ts` attaches the result with
  the rules of the duplication report.
- The **Discovery** panel, the component badge, the lists in the item details and
  **Copy decision** are in `src/components/`: `discovery-panel.tsx`,
  `discovery-records.tsx`, `component-header.tsx` and `copy-decision.tsx`. The
  copied entry is an `accept` entry of the GA-01a decision file
  (`src/lib/decision-entry.ts`). The desktop picker gets a title for the new file
  kind and uses the same read-only document command.
