# Step 1 gap / surplus report

Design: `docs/design/llm-led-architecture-analysis.md` (updated 2026-11-08).
Code reviewed at `2184d9d` (main). Review was read-only.

**Status at `86c6100` (2026-11-21).** The sections from "Verdict" to
"Verification limits" record the review of `2184d9d` and stay as history. A
**Now** note gives the state of each item on `main` at `86c6100`. Appendix A
(tomer-mayara/choom#57 to tomer-mayara/choom#96) closed G1–G12 and defects 1
and 3, and moved the producer to `packages/producer/src`. CR-005
(tomer-mayara/choom#97 to tomer-mayara/choom#99) added baseline version 6.
Appendix B plans P1–P13. Draft tomer-mayara/choom#101 records the owner
decisions of 2026-11-16 (plan change 20); it is not merged yet.

## Verdict

Step 1 is **substantially implemented**, as two parts:

1. **A manual producer workflow** in `docs/design/app-a/`. It has Stage 1–6
   helpers (`stage-*-commands.mjs` and related files) plus cookbooks. All six
   stages exist. They capture a digest-checked snapshot, run pinned Knip 6.44.1
   and dependency-cruiser 18.7.2 in read-only, no-network containers, and
   record reachability from explicit roots. Then they publish
   `baseline.yaml` / `discovery.yaml` / `run.yaml` through one shared validator,
   `validateRecords` in `stage-6-records.mjs`.
2. **A read-only viewer** in `src/`. It follows the model contract and all of
   Appendix A's version rules.

Step 1 is not complete against the design text. Many rules are left to the
operator or LLM, and some capabilities are missing. The design and the code have
also drifted apart: version 4 exists, and the producer accepts only a narrower
profile than the design describes.

There is **almost no automated test coverage of the producer**. Only Stage 6
(`test/interface/entry-points/producer-publication.test.mjs`) and the
duplication helpers have tests. Stages 1–5 and `recover-capture.mjs` have none.

**Now (`86c6100`):** the producer is TypeScript in `packages/producer/src`, with
one command line, `bun run producer` (GA-00b, GA-00b2). `docs/design/app-a/`
holds only documents. An operator and an LLM still run the stages. The producer
has 109 test files (46 unit, 54 interface and 9 integration) and 17 feature
files with 61 scenarios. Each stage and `recover-capture.ts` has tests. The
viewer reads baseline versions 1 to 6, shows a discovery result (CR-004) and
compares two version 6 files (CR-005). G1–G12 are closed. P1–P13 and most rules
in "Enforced only by the operator or LLM" stay open.

## Gaps: in the design, not in code

### Missing capabilities

| # | Gap | Design | Evidence | Now (`86c6100`) |
|---|---|---|---|---|
| G1 | **Accepted statements and `acceptanceRef`:** the producer rejects anything except `proposed`. No route creates a child baseline version (the producer always writes `parentId: null`). Acceptance and versioning exist only as fields the viewer can read. | 152–160, 615–616 | `stage-6-records.mjs:459-460`; `record-format.md:65` | Closed (GA-01a to GA-01c). `baseline decide` records human decisions, and `baseline next` makes a child version with `acceptanceRef`. |
| G2 | **Dividing a file into code units with the syntax tree:** `unitKind` must be `file`. | 174–180 | `stage-6-records.mjs:663`; `record-format.md:505` | Closed (GA-02a, GA-02b). Stage 5 divides a file into symbol and rest units. Stage 4 keeps whole files. |
| G3 | **Symbol membership selectors:** only an exact path or `/**`. The viewer also accepts `src/a.ts#decode` as an exact path without an error. | 147 | `stage-6-records.mjs:446-449`; `src/domain/baseline.ts:8-13` | Closed (GA-03a, GA-03b, GA-02a). Versions 5 and 6 have symbol selectors, and a path with `#` is refused. |
| G4 | **Git evidence:** no helper collects any, and `.git` is excluded at capture. | 458 | `stage-1-commands.mjs:127` | Closed for Git identity only (GA-04, D19). Capture still excludes `.git`. |
| G5 | **ripgrep:** not used. Content search is a TypeScript `createSourceFile` scan. | 741 | `stage-3-commands.mjs:308` | Closed (GA-05). `stage-3 text-search` runs ripgrep 1.18.0 on the snapshot. |
| G6 | **ts-morph:** the helpers use the raw TypeScript parser, with no ts-morph project and no definition or reference queries. | 742, 876 | `stage-4-inspect.mjs:188`; `stage-5-query.mjs:280` | Closed (GA-06a, GA-06a2, GA-06b). Stages 3 to 5 use a ts-morph project on the snapshot. |
| G7 | **Behavior-entry syntax rules:** there are no route, worker or command rules. Resource access is matched by name only. | 877–878 | `stage-4-inspect.mjs:176-179` | Closed for entries, partly closed for resources (GA-07a to GA-07f). 42 entry rules. Only the 4 knex rules check the receiver; other resource calls match by name. |
| G8 | **Approved framework plugins for Knip:** all plugins are turned off, so entries found only by plugins are lost. | 782–783, 788 | `step-2-cookbook.md:364,432` | Closed by D23, not D15 (GA-08). Every plugin stays off, and Stage 2 copies their entry patterns. |
| G9 | **Named parsing profile when there are no project settings:** not present. | 768–769 | Stage 1 helpers | Closed (GA-09). |
| G10 | **Node `type` field:** not read. Each file gets both an import pass and a require pass. The visible defect is TypeScript that compiles to CommonJS: it resolves with the `import` condition (plan change 16). | 866 | `stage-4-commands.mjs:245-254` | Closed (GA-10a, GA-10b, review fix C1). |
| G11 | **Gaps, deferred regions, uncovered code and questions in the Baseline view, and corrections submitted from it:** the viewer loads no discovery data and has no editing. | 190–191, 392–394 | Deferred by `cr-baseline-viewer-plan.md:48-49`; the design does not say so | Closed as CR-004 defines it (GA-11a, GA-11b1, GA-11b2). The viewer has no editor. |
| G12 | **"Do not save hidden reasoning":** not stated anywhere. The cookbooks ask for the "complete response". | 475 | `step-1-cookbook.md:245`, `step-2-cookbook.md:1105`, `step-3-cookbook.md:260` | Closed (GA-12, review fix B4), with known misses (see "Open after the final review"). |

### Partial: present but weaker than the design

| # | Item | Design | Evidence | Now (`86c6100`) |
|---|---|---|---|---|
| P1 | **Completion check "references resolve":** a question or gap `subjectRefs` that names nothing passes. | 710 | `stage-6-records.mjs:633` (only checks the value is a list of non-empty strings; confirmed by a probe) | Closed (GB-01a, GB-01b). |
| P2 | **Completion check "explanations cite evidence":** inspected-path steps can cite an excerpt that was collected but never reviewed. Only the entry site must be in a reviewed range. | 716–717 | `stage-6-records.mjs:718-726` | Closed (GB-02a, GB-02b). |
| P3 | **Completion check "summaries are current":** `run.yaml` keeps "The baseline is not yet recovered." through Stages 4–5. `coverage.unresolved` counts historical questions and gaps as well as current ones. | 450–452, 720–721 | `stage-4-5-publish.mjs:232-236`; `stage-6-commands.mjs:400-402` | Closed (GB-03). |
| P4 | **Unavailable analysis needs a result record and a gap:** no check links the two. | 950 | `stage-6-records.mjs` | Closed (GB-04a to GB-04d), with the limits in "Not covered by Appendix B". |
| P5 | **Run manifest:** no baseline ID or digest before Stage 6. Tool and model versions are reachable only through artifacts. No times per stage. | 457 | `stage-1-commands.mjs:336-344` | Open. Plan change 20: design text only. |
| P6 | **Tool-call records in Stage 1:** only command, arguments, time and exit code. No scope, limits or output digests. | 464–467 | `stage-1-commands.mjs:40-43` | Partly closed (GA-05, GA-06). Plan change 20: design text only. |
| P7 | **LLM audit record:** no prompt-version field. The saved prompt is not compared with its template. Stages 2–3 do not check that cited evidence is a subset of supplied evidence. | 462 | `stage-3-finish.mjs:371` | Partly closed (GA-12). Version field: design text only. Other checks: after the first real run. |
| P8 | **Entry candidates traced to metadata:** the LLM writes them. Code checks only that references resolve, not that the cited data contains the path or expression. | 801–802 | `step-2-cookbook.md:1344-1357` | Open. After the first real run. |
| P9 | **Deferral evidence:** there is no deferral type, so a "checked entry search" and a "precise claim" are not checked. The cookbook example ("inspection budget") conflicts with the design. | 846–848 | `stage-3-finish.mjs:391-395`; `step-3-cookbook.md:234-235` | Open. After the first real run. |
| P10 | **Investigate reported-unused files before a deferral:** the Stage 3 collector queries only unused exports and types. | 825–827 | `stage-3-commands.mjs:217,361-369` | Open. After the first real run. |
| P11 | **Concurrent edits:** a change is detected and capture stops; any retry is manual. Excluded paths are not listed, only the rules. | 426–428, 473 | `stage-1-commands.mjs:126-130,162-166` | Open. Plan change 20: design text only. |
| P12 | **Publishing two files as one update:** temporary files are renamed one at a time. Stage 2 renames discovery before the manifest; Stage 3 does the reverse. | 477–480 | `step-2-cookbook.md:1441-1442`; `stage-3-finish.mjs:474-485` | Closed as far as plan change 20 decides (GB-12a, GB-12b). "Not covered by Appendix B" lists the rest. |
| P13 | **Revisit affected work before Stage 6:** roots are frozen after Stage 4, and `record-format.md` says to start a new run instead. | 959–961 | `stage-4-5-publish.mjs:208-219`; `record-format.md:489-495` | Open. Plan change 20: design text only. |

Status on 2026-11-21: plan change 21 and the tickets GB-01a to GB-14 of
Appendix B close P1 to P4 and P12. "Changes during implementation (Appendix B)"
gives the state of each ticket and the open points. Plan change 20 closes P5,
P6, P11, P13 and the prompt-version field of P7 with design text. P8, P9, P10
and the other two checks of P7 wait for the real run.

### Enforced only by the operator or LLM

These rules depend on the cookbook prompts and are not checked by code:

- Unknown file roles stay unknown. **Now:** partly checked. CR-005 checks the use review of each role (`stage-1-role-use.ts`); a purpose role stays free text.
- Compiler inclusion is not an entry point. **Now:** still not checked.
- Workers, migrations and outside consumers are considered. **Now:** partly checked. GA-07 rules find worker, command and bin candidates. Migrations and outside consumers stay review items.
- An unused export does not make its file unused. **Now:** still not checked.
- Component declarations are included despite the excerpt cap. `component.yaml` sorts last under the 40-path cap (`stage-4-inspect.mjs:314-321`). **Now:** unchanged (`stage-4-inspect.ts:294-300`).
- No "utilities" component is created to remove unknowns. **Now:** still not checked.
- Prose is refreshed. **Now:** still not checked. GB-03 refreshes only the run summary.
- Preflight checks for Docker, access and versions are done. **Now:** partly checked. Code checks the pinned parsers, ripgrep, the tool images, the Docker endpoint and the producer code digest. Node, Bun, Docker access and write access stay manual checks.
- Minor corrections are recorded as dated notes. **Now:** manual by design (design 500-505).

## Surplus: in code, not in Step 1 of the design

| # | Surplus | Documented elsewhere? | Now (`86c6100`) |
|---|---|---|---|
| S1 | **Baseline `formatVersion: 4` with `systemEntryPoints`.** The producer, validator and viewer all support it (Startup/External markers, entry lists). Version 4 also follows the version 3 arrow rules. | Yes: CR-003 and `record-format.md` "Version 4". **Not in the main design**, which still says versions 1–3. | No longer surplus. The design has versions 4 and 5. CR-005 added version 6, which the design only names. |
| S2 | **Duplication assessment and report** (detector, review, binding, list, comparison, badges). | Yes: design Step 2/Step 3 and `app-a/duplication-assessment.md`. It is a later step, not Step 1. | Unchanged: a later step. The helpers moved to `packages/producer` (D5). |
| S3 | **Producer profile stricter than the design:** at least one component is required, `purpose` and `groupingReason` cannot be `null`, every component, including a grouping parent, needs `paths`, inspected paths need `steps` and `limits` (the design's own example fails), readiness must be `ready-with-gaps`, inspection priorities must be 3 or less and must not go down, and the LLM response must contain the record text exactly. | Partly, in `record-format.md`. These conflict with design 617–618 and with the 675–680 example. | Partly in the design (D9, GA-DOC). The readiness, priority and exact-text rules are only in `record-format.md` and the cookbooks. |
| S4 | **Viewer YAML profile and display limits enforced in the producer.** | `record-format.md` "Reader limits" | The producer uses the shared model and its limits. The producer and the viewer still each have their own YAML reader. |
| S5 | **`recover-capture.mjs`:** it hard-codes Choom-specific exclusions, writes a Choom-specific `dist` note for any target, silently skips hidden directories (conflicts with design 755), and its output cannot be finished by `stage-1-commands.mjs finish`. | Its cookbook admits the last point (`step-1-cookbook.md:435-437`). Not in the design. | Still true for `recover-capture.ts`, now TypeScript. Draft #101 makes it run the settings collector from the checkout. |
| S6 | **Other helper behavior:** the `work-choom` layout, rejection of symbolic links, Knip skip rules (a `knip` key in a manifest skips Knip), `--no-gitignore`, `KNIP_DISABLE_RAW_TRANSFER`, Stage 2 `prepare` changing registry paths (conflicts with "keep completed records unchanged", 449), and `inventory-view.py consolidate` deleting old input folders. | No | All remain. Stage 2 `start` now moves the registry paths. `--no-gitignore` is documented nowhere. |
| S7 | **Viewer reading aids:** v2 documentation detail (examples, Copy example, source notes, provenance), the Used by / Caller source views, canvas behavior, the load workflow (Cancel/Retry), and the built-in starter example. | Yes: viewer plan and readability plan (BV-*, BR-*) | Unchanged. CR-004 and CR-005 added views. |
| S8 | `scripts/analyze.ts` (ts-morph counts) and `scripts/validate-components.ts` (repository `component.yaml`). | The Compatibility section mentions the counts script. Repository tooling, not Step 1. | Unchanged repository tooling. |

## Defects found on the way

1. **Reserved ID mismatch.** Stage 6 reserves the baseline ID as an item ID; the Stage 4/5 publisher does not. A component whose ID equals the baseline ID passes Stage 5, then fails at Stage 6, after Stage 5 can no longer be reopened. A probe confirmed this. (`stage-6-commands.mjs:216` vs `stage-4-5-publish.mjs:224`) **Now:** fixed (GA-00c, review fix B7). Stages 1, 4/5 and 6 reserve the baseline ID.
2. **The built-in starter baseline breaks single ownership.** It lists `src/**`, `src/domain/**` and `src/platform/**` as three top-level components with no parents, so `src/domain` and `src/platform` files have two direct owners. (`src/domain/starter-baseline.ts:10-17`) **Now:** open on `main` (14 files have two direct owners). Draft #101 fixes it.
3. **`picomatch` is not declared.** It is loaded from `node_modules` but is not a dependency. (`stage-4-commands.mjs:226`) **Now:** fixed (GA-00b). `packages/producer/package.json` declares it.
4. **The Knip image is not fully pinned.** The base image tag and transitive dependencies are recorded but not pinned. (`step-2-cookbook.md:663-665`) **Now:** open. The Knip image (`stage-2-tool-image.ts:15`) and the Stage 4 graph image (`stage-4-commands.ts:330`) start from `node:24-bookworm-slim`. Draft #101 records that the owner accepts this: each run pins its images by the saved image ID.

## Design-document drift to fix

- Appendix A (602–611) lists versions 1–3 only. Add version 4, or link CR-003. **Now:** versions 4 and 5 are in the design. Version 6 is only named (see the new drift below).
- The Report views bullet (392–394) promises gaps, deferred regions and corrections, which Compatibility (522–523) rules out. Mark the bullet as deferred. **Now:** fixed (GA-11b2, CR-004).
- Line 147 says "paths or symbols"; the producer and viewer support paths only. **Now:** no longer drift. The code has symbol selectors.
- Line 741 says ripgrep and lines 742/876 say ts-morph; the helpers use the TypeScript API. **Now:** no longer drift. The code uses both.
- The smell catalog is called "eight families" (208) and "seven-family" (547). **Now:** fixed. Both places say eight.
- The Contents list omits "Duplicated public capabilities" and "Duplicated-interface report". **Now:** fixed.
- `record-format.md:89`, `step-6-cookbook.md:15-17` and `start-here.md:75` still say "versions 2/3" or "three versions". **Now:** fixed. They say versions 1 to 6.
- The viewer plan's BV-05 display table is stale. The readability plan replaced it. **Now:** fixed. A note marks the table as history.

**New drift at `86c6100`** (not fixed by draft tomer-mayara/choom#101):

- Design line 5 says "Updated: 2026-11-15", but CR-005 changed the design
  after that date.
- Design 556–557 says that the ts-morph script gives "counts, not the proposed
  queries". The producer now runs those queries (GA-06a, GA-06b).
- Design 660–663 asks for "at least one path selector" for each component.
  Versions 5 and 6 accept a component with symbols only
  (`record-baseline.ts:81-83`).
- Design 697 and 715 give the discovery `formatVersion` as 1 and leave out
  `baselineDigest`. The fixed discovery result is version 2
  (`record-format.md` "Fixed discovery result").
- Design 636–651 names version 6 but does not define it or link CR-005. The
  arrow text stops at version 5.
- Design 837 and 842 still name "supported framework plugins" and "approved
  built-in plugin" paths. D23 keeps every Knip plugin off and copies their
  entry patterns.
- `record-format.md:358` says that versions 3 and 4 can add `sourceUsage`. The
  model accepts it in versions 3 to 6.

## Verification limits

- All helpers pass `node --check`. **Now:** no longer relevant. The helpers are TypeScript, and `bun run typecheck` covers them.
- Validator probes ran against an in-memory copy of the producer fixture. They confirmed P1, P2 and Defect 1, and that `accepted`, parent cycles, duplicate owners, non-file units and glob selectors are rejected. **Now:** tests cover these cases. Defect 1 is fixed. P1 and P2 stay open (Appendix B).
- Arc probes confirmed that version 3/4 files never draw permission arrows. **Now:** still true for versions 3 to 5 (`README.md:143-148`).
- **No unit, behavior or producer test ran.** `node_modules` is not installed, Node here is 22.23 (the project needs 26.13 or later), and Docker was not used. Before acting on this report, run `bun install`, then `bun run test`, `bun test ./test/interface` and the Stage 4 Docker graph fixture. **Now:** CI runs every suite (`.github/workflows/ci.yml`). `package.json` still needs Node 26.13 or later.


---

## Appendix A: Gaps - tickets

Revision 3, 2026-11-15. This plan closes gaps G1–G12. The owner made the
decisions in the log below. Revision 3 corrects the errors that the review of
revision 2 found (see "What changed in revision 3"). "Changes during
implementation" records what changed after work started.

### Changes during implementation

Each ticket is a PR. Each PR was stacked on the branch of the PR before it. On
2026-11-16 the owner asked to merge the whole stack. Every PR then targeted
`main`, and the top PR (tomer-mayara/choom#95) merged the stack with one merge
commit, so the commits of each PR are in `main` (see "How the stack merged").

| Ticket | PR | State |
|---|---|---|
| Report | tomer-mayara/choom#57 | Merged into `main` (squash commit f99ca97). |
| GA-03a | tomer-mayara/choom#58 | Merged |
| GA-01c | tomer-mayara/choom#59 | Merged |
| GA-11a | tomer-mayara/choom#60 | Merged. The owner approved GA-11b, and with it the CR-004 text, on 2026-11-16 (recorded in the GA-11b1 PR). |
| GA-DOC | tomer-mayara/choom#61 | Merged |
| GA-00a | tomer-mayara/choom#62 | Merged |
| GA-00b | tomer-mayara/choom#63 | Merged |
| GA-00d | tomer-mayara/choom#64 | Merged |
| GA-03b | tomer-mayara/choom#65 | Merged |
| Plan update | tomer-mayara/choom#66 | Merged. The owner approved D21 on 2026-11-16. |
| GA-00b2 | tomer-mayara/choom#67 | Merged |
| GA-00e | tomer-mayara/choom#68 | Merged |
| GA-00c | tomer-mayara/choom#69 | Merged. This PR also records plan changes 6 and 7. |
| GA-12 | tomer-mayara/choom#70 | Merged |
| GA-09 | tomer-mayara/choom#71 | Merged. This PR also records plan change 8. |
| GA-04 | tomer-mayara/choom#72 | Merged. This PR also records plan change 9. |
| GA-05 | tomer-mayara/choom#73 | Merged. This PR also records plan changes 10 and 11. |
| GA-06a | tomer-mayara/choom#74 | Merged. This PR also records plan changes 12 and 13. |
| GA-06a2 | tomer-mayara/choom#75 | Merged. This PR also records plan change 14. |
| GA-10a | tomer-mayara/choom#76 | Merged. This PR also records plan changes 15 and 16. |
| GA-10b | tomer-mayara/choom#77 | Merged. This PR also records the approval of plan changes 6 to 16. |
| GA-01a | tomer-mayara/choom#78 | Merged. This PR also records D22. |
| GA-06b | tomer-mayara/choom#79 | Merged. The query command is the Stage 4 inspect action `references PATH SYMBOL`, where the design places focused source queries. |
| GA-01b | tomer-mayara/choom#80 | Merged |
| GA-07a | tomer-mayara/choom#81 | Merged. Stage 4 collect saves the candidates as `behavior-entry-candidates.json`, and the entry analysis names it as `behaviorEntryCandidatesRef`. The ticket said `behaviorEntries`, but that field already holds reviewed entries that the LLM writes. The list starts with one rule, the Express `get` route, which the scenarios use. |
| GA-07b | tomer-mayara/choom#82 | Merged. 30 route rules (Express app and router, Fastify, Hono). The method comes from the rule, so the record does not change. Every call rule needs a documented sample in a data-driven test. |
| GA-07c | tomer-mayara/choom#83 | Merged. 3 rules: `new Worker` of `node:worker_threads` and of `worker_threads` (the worker file is the name, no handler), and BullMQ `new Worker` (the queue is the name, argument 1 is the handler). |
| GA-02a | tomer-mayara/choom#84 | Merged. Not as the ticket says: a part of a file names its file by `path` and `sha256`, not by `fileRef`, and it has `ranges`, not one `range`, because the rest is often split. Only Stage 5 divides files, with the scope `unitKind: file-or-part`. The LLM writes the units, and the checks require exactly the units that `divideFile` gives. D21 is done as proposed. |
| GA-07e | tomer-mayara/choom#85 | Merged. 4 Vite `settings-literal` rules: `build.rollupOptions.input`, `build.rolldownOptions.input`, the top-level `input` and `build.lib.entry`. There is no Next.js rule, because `next.config.*` names no entry files as literals; Next.js finds its entries from its folders. |
| GA-07f | tomer-mayara/choom#86 | Merged. A second pinned rule list (knex starter rules) with `typePath` and `nameCall`. Stage 4 collect saves `resource-access-candidates.json` with the confidence `receiver-import`, `receiver-type` or `name-only`, `identity: inferred-from-name`, and no owner. `resource-access.json` names it as `resourceAccessCandidatesRef`. The rule-list and call-rule code is now shared with GA-07a. |
| GA-02b | tomer-mayara/choom#87 | Merged. Not as the ticket says: a new Stage 5 request, `parts PATH SYMBOL...`, saves `parts-NNN.json`, because Stage 5 `collect` never sees a divided file. A part is named by its symbol or `rest`, not by a unit ID. An import goes to the part that holds all uses of its names. `shared`, `unreferenced` and `not-resolved` imports stay at file level. |
| GA-07d | tomer-mayara/choom#88 | Merged. The engine changes, test first, as the ticket table allows: call rules get the optional fields `nameCall` and `sameValueMethods`. There are commander and yargs command rules (the yargs handler is argument 3), and a new rule kind, `package-bin`, which links a bin file to its source only with evidence (the snapshot file, or the saved `outDir` and `rootDir`). |
| GA-08 | tomer-mayara/choom#89 | Merged. This PR also records plan change 17 and D23 (path A, which replaces D15). Every plugin stays `false`. The plugin patterns are copied into the Stage 2 profile, and Stage 4 lists their files with `found: knip-plugin-pattern`. The first real run of the `@docker` scenarios is in CI. |
| GA-11b1 | tomer-mayara/choom#90 | Merged. This PR also records the owner's approval of GA-11b and the CR-004 text, and plan change 18. The Stage 6 helper is now TypeScript, with no change of behavior. Stage 6 saves discovery version 2 with `baselineDigest`, and `verify` checks it. |
| GA-11b2 | tomer-mayara/choom#91 | Merged. The viewer part of CR-004: a discovery contract and decoder (refuses version 1 and another baseline digest), placement on baseline items with an Unplaced list and a deferred group, the duplication report's load rules, and Copy decision (a GA-01a `accept` entry). Stage 6 also checks the fixed discovery result with the viewer contract, so the producer cannot publish a result that the viewer refuses. |
| Review fixes A1–A6 | tomer-mayara/choom#92 | Merged. Plan change 19. Stage 6 saves the fixed discovery result as the viewer reads it; `baseline decide` runs the checks of `baseline next` and saves a record all or nothing; no Copy decision on a next version; files are divided only with the pinned ts-morph. The CI `web` job now has 25 minutes. |
| Review fixes C1–C6 | tomer-mayara/choom#93 | Merged. Plan change 19. `import()` in a `.cts` file gets the condition that TypeScript gives it; a type shim keeps the import of its package; CommonJS exports are followed; candidates keep the order of the scope files; one copy of the candidate limit and of the source-file rule; a resource type path needs a step. |
| Review fixes D1–D6 | tomer-mayara/choom#94 | Merged. Plan change 19. The `package-bin` rule reads strict JSON, arrays and large files as npm does; `export default function` settings get the right reason; the GA-08 settings-file filter is documented as a test of names; plugins that Knip turns on without a dependency are recorded. |
| Review fixes B1–B7 | tomer-mayara/choom#95 | Merged. This PR also records plan change 19. An action on a published Stage 2 or Stage 3 attempt changes nothing; Stage 2 finish checks every phase again; Stage 2 checks the snapshot inventory with checkout code; more saved forms of hidden reasoning are refused; one shared evidence resolver; the question and gap contract is checked where each record enters; Stage 1 reserves the baseline ID. |

Plan changes (the owner approved plan changes 6 to 16 on 2026-11-15):

1. **GA-00b is split.** GA-00b moves the producer without changing behavior.
   A new ticket, **GA-00b2**, moves the code blocks that Stages 1 and 2 run
   from saved cookbook copies into source modules. It keeps the saved-copy
   protection until GA-00e.
2. **New order for the setup tickets:** GA-00b → GA-00d → GA-03b → GA-00b2 →
   GA-00e → GA-00c. GA-00d and GA-03b needed nothing else, so they went first.
   GA-00e now comes before GA-00c, for this reason: today each attempt runs
   from copies of the producer code that are saved in the attempt folder. A
   copy in that folder cannot import a workspace package such as
   `@choom/baseline-model`, and a copy of the package would not stay frozen.
   GA-00e replaces the saved copies with a code-digest check. Its digest covers
   `packages/producer/src` and `packages/baseline-model/src`. After that,
   GA-00c can import the package.
3. **Symbol-only components (D9 changed).** A version 5 component can own only
   symbols, with no path (GA-03b). So the producer profile rule "every
   component has a path" becomes "every component has a path or a symbol".
   GA-02a makes this change when it adds version 5 to the producer.
4. **D21 (the owner approved it on 2026-11-16):** a symbol name is any
   JavaScript identifier name. Reserved words such as `class` pass the syntax
   check, as `default` does. The viewer checks syntax only, and the producer
   (GA-02a) refuses a symbol that the file does not declare. No reserved-word
   list.
5. **Local browser acceptance.** `bun run test:e2e` can run in the cloud
   session with the preinstalled Chromium (revision 1243; the project pins
   1254). One layout scenario, "the full two-line name, both entry counts, and
   duplication marker fit in the component header", fails locally on the base
   before any change. CI passes it. Since the viewer bundles Inter (plan change
   20), the scenario passes locally too, with or without an installed Inter.
6. **D4 refinement (approved with plan changes 6 to 16):** a mechanical
   edit does not trigger the TypeScript conversion. A mechanical edit changes
   only an import path, an entry in a list, a mount path or a comment. A change
   to the logic of a file still converts it first (rule 5).
   - GA-00c made only mechanical edits to `.mjs` files: the import path in
     `stage-4-5-publish.mjs`, the import path and one entry of the reserved-ID
     list in `stage-6-commands.mjs`, and the expected messages in
     `producer-publication.test.mjs`.
   - GA-00e did more. In each of the seven Stage 3–6 helpers it added the
     producer-code check, removed the old saved-copy comparisons and changed
     paths (59 lines added, 57 removed in total). It did not convert them,
     because the edits were small. The owner approved this exception with
     plan changes 6 to 16. Each of these files is converted when a later
     ticket changes its logic
     (GA-12 converts `stage-3-finish.mjs` and `stage-4-5-publish.mjs`).
7. **GA-12 scope.** The check covers every saved LLM call. Stage 6 also saves
   one, in its readiness packet, which the ticket did not list. There is no
   provider JSON file in any packet, so `checkVisibleResponse` checks only
   the saved response text. GA-12 below shows the changed steps.
8. **Gaps that a tool finds are added by `finish`.** GA-09 records the
   "no project settings" gap in the Stage 1 settings record, which is now
   `formatVersion: 2`. Stage 1 `finish` adds each gap of a tool record to the
   discovery gaps itself (`toolGaps` in `stage-1-gaps.ts`). The reviewer does
   not copy them. The IDs are `s1-<record>-gap-NNN`, and the review cannot
   use them. `verify` refuses a saved discovery that lacks one. GA-04 uses
   the same function for its Git gap (step 5 below).
9. **GA-04 does not run `git status` (E11 was not enough).** `git status`
   can run the clean and process filters that a target defines in its own
   Git settings. In a partial clone, even `ls-tree` fetches missing objects
   through a command from the target's settings. So GA-04 runs only
   `version`, `rev-parse`, `symbolic-ref` and `ls-tree`. It compares the
   saved snapshot with the commit inside the producer. Every call also
   removes inherited `GIT_*` variables and sets `GIT_TERMINAL_PROMPT=0`,
   `GIT_ALLOW_PROTOCOL=` (no transport), `GIT_NO_LAZY_FETCH=1`,
   `GIT_NO_REPLACE_OBJECTS=1` and `--no-pager`. A test with a real partial
   clone checks that no program runs.
10. **GA-05 does not use `trustedDependencies` (E10 and D16 changed).**
    `@vscode/ripgrep` 1.18.0 has no install script. It takes the program
    from a package for each platform (optional dependencies), so a frozen
    `bun install` installs it with no GitHub download and no token. A
    `trustedDependencies` list would also replace Bun's default list, and
    the install script of `geckodriver` would then not run. Stage 3 `start`
    records the ripgrep version, program and digest, and every later action
    refuses a changed program. The search is a Stage 3 action,
    `stage-3 text-search`, and the Stage 3 finalizer checks each search
    receipt.
11. **GA-06a is split.** GA-06a adds the snapshot project, `listExports`
    and the gaps for missing compiler inputs. It adds the operator action
    `stage-3 exports PATH`, in the same form as `stage-3 text-search`, and
    replaces the parser call of Stage 3 only. A new ticket, **GA-06a2**,
    converts `stage-4-inspect.mjs` and `stage-5-query.mjs` to TypeScript
    (rule 5) and replaces their parser calls. Each PR then stays small
    enough to review. GA-02a and GA-07f, which work in Stages 4 and 5, now
    also need GA-06a2.
12. **GA-06a2 also converts `stage-5-commands.mjs`.** Stage 5 loads its
    parser in `stage-5-commands.mjs` and gives it to `stage-5-query.mjs`.
    To use the snapshot project, Stage 5 must load ts-morph there instead,
    which changes the logic of that file. Rule 5 then requires that it
    becomes TypeScript first.
13. **The Stage 3 loading search record changed (GA-06a).** Its profile is
    now `stage-3-loading-syntax-v3`, and its parser is the snapshot project.
    The matches are the same. The line-1 columns of a file with a byte
    order mark are one less, because ts-morph does not count that mark.
    GA-06a2 must keep the lines of Stages 4 and 5 the same.
14. **The Stage 4 source sites record changed (GA-06a2).** The site lines
    stay the same. In a file with a byte order mark, the diagnostic `start`
    values are one less, for the same reason as plan change 13, and a new
    `limits` line says so. The records of Stages 4 and 5 keep
    `formatVersion: 1`, because the producer code record (GA-00e) makes each
    run use one producer version.
15. **GA-10 is split.** A correct GA-10 must change the checks of the graph
    helper `stage-4-graph.mjs`, so rule 5 applies. **GA-10a** converts that
    helper to TypeScript with no behavior change. The helper runs in the
    `node:24-bookworm-slim` graph image, and this session has no Docker
    engine. The CI `producer` job is the proof that the image runs the
    converted file and that the helper writes nothing to stderr there.
    **GA-10b** then makes the module kind change.
16. **The GA-10 scenarios are corrected (GA-10b).** The two scenarios of
    GA-10 pass today: dependency-cruiser reads `import` syntax only in the
    import pass and `require` syntax only in the require pass, so a
    JavaScript file already gets the right target. The real G10 defect is
    TypeScript that compiles to CommonJS: a `.cts` file, a `.ts` file with
    `module: commonjs`, or a `.ts` file with `module: nodenext` in a package
    whose `type` is not `module`. Its `import` statements become `require`
    calls at run time, but the graph resolves them with the `import`
    condition and marks them `pre-compilation-only`. GA-10b keeps the two
    scenarios as guards and adds scenarios that fail today.
17. **GA-08 follows D23, not D15 (the owner chose this on 2026-11-16).**
    The first step of GA-08 tested D15 on Knip 6.44.1. With a plugin set to
    `{ config: [] }`, Knip adds its default entries, but it still loads and
    runs a settings file in three cases:
    - a settings path in a package script (`vite build --config x.js`);
    - a folder in a script (`next build web`);
    - `babel.config.js` when the Expo or Docusaurus plugin is on.

    37 of the 92 plugins that Knip turns on by dependency can do this. No
    Knip option turns it off. So GA-08 keeps every plugin `false`, and
    steps 2 and 5 change:
    - Stage 2 copies the default `entry` and `production` patterns of the
      plugins that the dependencies turn on. The patterns come from the
      installed Knip, with the plugin, the dependency and the manifest of
      each pattern.
    - Stage 4 collect lists the files of these patterns next to the GA-07e
      settings candidates, with `found: knip-plugin-pattern`.

    The D15 test stays in the suite as the record of why.
18. **GA-11b is split (GA-11b1 and GA-11b2).** The owner approved GA-11b,
    and with it the CR-004 text, on 2026-11-16. CR-004 says that Stage 6
    writes discovery `formatVersion: 2` with `baselineDigest`. Stage 6 was
    `stage-6-commands.mjs`, so rule 5 (D4) applies, as for GA-10a.
    - **GA-11b1 (producer):** converts the Stage 6 helper to TypeScript with
      no change of behavior, with characterization tests first. Then Stage 6
      saves the fixed discovery result as version 2 with `baselineDigest`, and
      `verify` checks it against the saved baseline file. The working draft
      stays version 1, because only Stage 6 knows the fixed baseline bytes.
    - **GA-11b2 (viewer):** the steps of GA-11b in `@choom/baseline-model` and
      the viewer, as CR-004 says.

    The owner approved this split on 2026-11-16.
19. **Final review of the stack (2026-11-16; the owner approved it on
    2026-11-16).** A review of the whole stack (tomer-mayara/choom#58 to
    tomer-mayara/choom#91) found 25 defects in four areas. A reviewer probe or a
    clear code path showed each one. Four PRs fix them, each fix with a test
    that failed first. They are stacked on GA-11b2 in this order:
    tomer-mayara/choom#92 (A), tomer-mayara/choom#93 (C), tomer-mayara/choom#94
    (D) and tomer-mayara/choom#95 (B).
    - **CI:** the `web` job now has 25 minutes, not 15. Its main step grew from
      7 min 15 s on GA-00c to 12 min 46 s on GA-11b2, and the first run of
      tomer-mayara/choom#92 stopped at the 15-minute limit.
    - **CI apt mirrors:** the `web` and `desktop` jobs used one apt mirror,
      `mirrors.kernel.org`, which the runners could not reach on 2026-11-16.
      The list now holds the Azure mirror of the runner, the Canonical
      archive and `mirrors.kernel.org`, so apt uses the next one when a
      mirror fails (tomer-mayara/choom#92, and tomer-mayara/choom#96 for
      `main`).
    - **A flaky browser step from GA-11b2:** the keyboard scenario "Reach tabs
      and disclosures with visible keyboard focus" counted the Copy decision
      actions before React showed the opened disclosure. The step now waits
      for the content first (tomer-mayara/choom#92). Under CPU load, it failed
      in 3 of 20 runs before the fix and in 0 of 30 runs after it.
    - **Review finding D5 changes no behavior:** the documents now say that
      the GA-08 settings-file filter tests only names, and they list its known
      misses. A list of settings files kept by hand needs an owner decision
      (plan change 20 moves it to after the real run).
    - "Open after the final review" below lists what stays open.
20. **After Step 1: one real run first (the owner decided on 2026-11-16).**
    The owner went through each item of "Open after the final review".
    - **Next step:** one real Step 1 run on Choom itself, on the owner's
      computer, before Step 2. A Claude Code session there is the operator and
      the LLM, and the owner decides on the statements. The run follows
      [First real run](../design/app-a/first-real-run.md). A problem that does
      not block is recorded. A stage that refuses gets a producer fix and a new
      run from Stage 1, at most twice. The run folders go to the branch
      `run/choom-step-1`, which never merges into `main`.
    - **Approved:** D21, plan change 18 and plan change 19, with the CI `web`
      job limit of 25 minutes.
    - **The Step 2 gate:** the producer gets the completion checks P1 to P4.
      For P1, each subject of a question or gap names a snapshot file or
      folder, the snapshot ID, a question or gap, an entry candidate, or a
      baseline item by the viewer's rule (the item ID, or the ID and a dot). A
      gap that Stage 1 copies from a tool record keeps its subjects. The shared
      record checks of Stages 4 to 6 run the check, so a rename that orphans a
      frozen subject is refused at the stage that makes it.
    - **P12:** Stages 2 and 3 write the run manifest last and roll back, as
      Stages 4 to 6 do.
    - **The design text changes, not the code:** P5 (the run manifest), P6 (the
      Stage 1 tool-call records), the prompt-version field of P7, P11
      (concurrent edits) and P13 (a root correction after Stage 4 needs a new
      run). The design now says what the producer does.
    - **Decided after the run:** P8, P9, P10, the other two checks of P7, the
      settings-file filter (review finding D5), lists that are not
      virtualized, and one ticket for the copies that DRY3 forbids.
    - **Fixed now:** Defect 2 (the example's inner components get the parent
      `workspace`, which excludes their files), and recovery runs the settings
      collector from the checkout, as Stage 1 does.
    - **Accepted:** Defect 4. Each run pins its tool images by the saved image
      ID, and the base tag is not pinned. The other limits in "Open after the
      final review" stay documented until a real target hits one of them.
    - **The viewer** bundles its font, Inter.
    - **The stray-file suspicion** gets a probe with the Step 2 gate.
21. **The Step 2 gate (2026-11-21).** The producer now has the completion
    checks P1 to P4 and the one update of P12, each with a test that failed
    first. A new feature, `cookbook/behavior/producer/completion-checks.feature`,
    states them.
    - **P1:** the shared record checks of Stages 4 to 6 refuse a question or gap
      subject that names nothing, by the rules of plan change 20. A folder is
      written with or without a final `/`. The entry candidates of the earlier
      entry analyses also count, because Stage 3 can retire a candidate with a
      note that names it. Stages 1 to 3 do not run the check. Their prompts
      state the rule, and a Stage 1 to 3 record that breaks it fails at Stage 4.
    - **P2:** each step of an inspected path cites a saved source range, and
      each range that it cites lies inside a reviewed range of the selected
      history.
    - **P3:** the Stage 4 and 5 publisher writes current `coverage` summaries.
      Stage 6 keeps record counts and says that they keep their history,
      because no record field marks a question or gap as replaced.
    - **P4:** Stage 2 finish and the shared record checks refuse an
      unsupported Knip preflight or a failed or skipped Knip mode without a gap
      that cites the record. The Stage 3 finalizer does the same for symbol
      mentions that are unavailable or skipped. The Stage 4 graph stays
      `completed`.
    - **P12:** Stages 2 and 3 publish their drafts as one update with `run.yaml`
      last and roll back, as Stages 4 and 5 do. The three stages share this
      code.
    - **Stray files:** a probe showed that the Stage 4 and 5 publisher
      registered a file that no producer action saved. `check`, `finish` and
      `verify` now refuse such a file, as Stage 6 already did.

### How to work every ticket

Each ticket follows `docs/coding-principles.md` and `docs/new-feature-cookbook.md`:

1. **Write the acceptance test first.** Add the Gherkin scenario to a
   `.feature` file in `cookbook/behavior/`. Add its steps to `test/steps/`.
   Run it. It must fail for the reason that the ticket gives.
2. **Use TDD for the parts.** For each step in the ticket, write one focused
   test that fails, make it pass with the smallest change, then refactor while
   all tests pass.
3. **Make the acceptance test pass.** Then run `bun run check`,
   `bun run check-types`, `bun run build` and `bun run habit-hooks --all`.
4. **Update the constraints.** Update the `component.yaml` links, the TypeSpec
   contracts, the dependency-cruiser rules and the documents that the ticket
   names. A human approves the constraint changes before merge.
5. **Convert to TypeScript when you touch a file.** Before a ticket changes a
   producer `.mjs` or `.py` file, convert that file to TypeScript under the
   existing tests, in a separate commit.

A refactor ticket (GA-00a, GA-00b) does not start with a failing test. It
starts with **characterization tests**: tests that pass on the current code and
record its current behavior.

**Test types** (from `docs/coding-principles.md`):

| Mark | Type | Meaning in this plan |
|---|---|---|
| U | Unit | Tests code in one workspace. Other Choom workspaces are replaced by test doubles. |
| I | Interface | Tests one contract: its accepted inputs, outputs and errors. |
| N | Integration | Tests real code from two or more workspaces together. A producer test that runs `@choom/baseline-model` code is an integration test. |
| A | Acceptance | A Gherkin scenario through a public boundary. |
| D | Integration with Docker | Runs Knip or dependency-cruiser in its container. Tag the scenario `@docker`. It runs in the CI `producer` job and with `bun run test:producer:docker`. |

### What changed in revision 3

**Errors corrected:**

| # | Error in revision 2 | Correction |
|---|---|---|
| E1 | GA-11b said the viewer refuses a discovery result with unknown `subjectRefs`, and then said it lists them as "Unplaced". The two steps conflict. Also, the producer allows unknown `subjectRefs` today (P1), so real files would be refused. | The viewer lists unknown subjects as "Unplaced". It does not refuse them. |
| E2 | GA-11b said the viewer checks the baseline digest in the discovery result. `discovery.yaml` has no digest field (`record-format.md:549-552`). It has only `baselineRef`, an ID, and IDs like `baseline-001` repeat across runs. | GA-11b adds `baselineDigest` to the discovery result at Stage 6 (discovery format version 2). The viewer refuses version 1 discovery results (D20). |
| E3 | GA-11b said the counts are "open items". The question and gap lists keep their history (`record-format.md:564-565`), so a count includes items that are already answered. | The viewer says "recorded questions and gaps". It does not say "open". |
| E4 | GA-11b read a code-mapping summary. That is a separate fact record, and CR-004 says the viewer loads no evidence. | The viewer reads `discovery.yaml` only. A subject that names a file is listed by its ID. |
| E5 | GA-01b added a "needs a new assessment" marker for membership changes. The design already says that any change to a saved baseline starts a new assessment (design 419). The marker added nothing. | The marker is removed (D12 changed). |
| E6 | GA-01a checked the decider against "the run's" model, but a decision file has no link to a run. | The `decide` command takes the run folder as input and reads the model names from that run's LLM call records. |
| E7 | GA-00b changed how a run records the producer code. That is a change in behavior, but the ticket called it a refactor with no failing acceptance test. | That change is now ticket GA-00e, with its own failing scenario. GA-00b keeps behavior unchanged. |
| E8 | Removing the saved code copies also removed a protection: today each attempt runs from a frozen copy, so the code cannot change in the middle of an attempt. | GA-00e checks the code digest at every stage action and refuses a changed producer. |
| E9 | Scenarios that need Docker would run in the normal Cucumber profile and fail on a computer without Docker. | GA-00d adds an `@docker` tag. The normal profile excludes it, and the CI `producer` job runs it. |
| E10 | GA-05: Bun does not run the install scripts of dependencies unless they are listed in `trustedDependencies`. So `@vscode/ripgrep` would install without its program. | GA-05 checks that the program exists after `bun install`. Version 1.18.0 has no install script, so it needs no `trustedDependencies` entry (plan change 10). |
| E11 | GA-04 ran `git status` in the target repository. A target's Git settings can make `git status` run a program (`core.fsmonitor`). The design forbids running target code. | GA-04 turns off `core.fsmonitor`, hooks and system and user Git settings for every Git command. |
| E12 | GA-07e (frontend settings) cannot use the GA-07a rule shape, which only matches calls. | The GA-07a engine has two rule kinds: `call` and `settings-literal`. |
| E13 | GA-00a did not add the new workspace's tests to `bun run test`, and did not move the generated contract output. | GA-00a adds both. |
| E14 | The producer runs on Node, but `@choom/baseline-model` is TypeScript. | GA-00a adds a test that Node 26 imports the package directly (it uses only plain, erasable TypeScript). The CLI runs on Node too. |
| E15 | GA-03b did not say what version 5 contains. | Version 5 is version 4 plus `symbols`. It keeps the version 3 and 4 arrow rules. |
| E16 | GA-02a did not say what to do with `export const a = 1, b = 2`, function overloads or `export default`. | One declaration with several names is refused as a symbol selector. Overloads form one unit. An anonymous default export is named `default`. |
| E17 | Defects 2 and 4 and partial findings P1–P13 had no ticket, and the plan did not say so. | They are listed in "Not covered by this plan". |

**Simplifications:**

- GA-05: the search always uses `--hidden --no-ignore`, because the snapshot
  already contains only captured files. The "reads outside the snapshot"
  scenario became one unit test, because the search root is always the snapshot.
- GA-01b: two scenarios instead of three (the marker scenario was removed).
- GA-11b: there is no code-mapping input.

### Decision log

| # | Question | Decision |
|---|---|---|
| D1 | What is the producer? | Product code, in a `packages/producer` workspace, under the full BDD and TDD rules. |
| D2 | Which gaps to build? | All 12. The design keeps ripgrep and ts-morph, and the code changes to follow it. |
| D3 | Code inside the cookbooks | It moves into source modules. The cookbooks keep only commands and review steps. |
| D4 | JavaScript and Python | A file becomes TypeScript the first time that a ticket changes it. `inventory-view.py` too. |
| D5 | Duplication helpers | They move to `packages/producer` too. `docs/design/app-a/` keeps only documents. |
| D6 | How to start the producer | One CLI: `bun run producer <stage> <action>`. It runs on Node 26. No wrapper files stay in docs. |
| D7 | Record of the producer code used | The receipt records the package version, the Git commit when there is one, and one digest of `packages/producer/src`. Each stage action checks that digest. |
| D8 | Owner of the baseline rules | A new `packages/baseline-model` workspace. The viewer and the producer use it. The producer adds only its run checks. |
| D9 | Producer rules that are stricter than the design | The producer wins. The design text changes (GA-DOC). |
| D10 | Who accepts a statement | The decision file names a human decider. Code refuses a decider that matches a model in the run's LLM records. The design says that this is a process rule, not proof. |
| D11 | Shape of G1 | One decision file with `accept` and `correct` entries, and one command that makes the next version. There is no `rejected` decision. |
| D12 | Membership change in a new version | No marker. Every new version has no discovery result until a new run. Re-mapping (design mode B) is later work. |
| D13 | G2 and G3 | Symbol selectors divide a file. Each named symbol becomes a unit. The rest of the file is one unit, owned by the file's path owner, or `null` with a reason. Symbols need `formatVersion: 5`. |
| D14 | G7 | One rule engine with a pinned rule list. The first rules cover HTTP servers, workers and queues, CLI tools and frontend settings. |
| D15 | G8 | Replaced by D23 on 2026-11-16 (plan change 17). Before: plugins run with `config: []`, so they use only their default file-name patterns and never load settings files. There is no approval list. This is not yet tested on Knip 6.44.1: GA-08 tests it first. |
| D16 | ripgrep | `@vscode/ripgrep` at an exact version. Version 1.18.0 needs no `trustedDependencies` entry (plan change 10). |
| D17 | G11 | CR-004 is approved in principle. The viewer shows discovery questions and gaps, and can copy a decision-file entry. There is no editor in the viewer. The owner approved GA-11b, and with it the CR-004 text, on 2026-11-16. |
| D18 | Docker tests | A CI `producer` job runs `@docker` scenarios. `bun run check` skips them. |
| D19 | G4 | Git identity only. History is left to Step 2 planning. |
| D20 | Old discovery files in the viewer | Approved by the owner on 2026-11-15. The viewer refuses a discovery result without `baselineDigest`, because an ID alone can match the wrong baseline. Old runs need a new run to show in the viewer. |
| D22 | Format of the decision file | Approved by the owner on 2026-11-15. The decision file is YAML, as the CR-004 text says. The producer reads it with the bounded YAML profile of a baseline and saves its exact bytes as `decisions/<id>.yaml`. |
| D23 | G8 | Approved by the owner on 2026-11-16 (path A). It replaces D15, because Knip 6.44.1 still runs settings files that package scripts name, even with `config: []`. Every Knip plugin stays `false`. For each plugin whose package is a dependency of a manifest, Stage 2 copies the plugin's default `entry` and `production` patterns from the installed Knip, with the plugin, the dependency and the manifest. Patterns of settings files are not copied. Lost: plugin `resolve` steps (such as Vite's `index.html` start files), the `.vue`, `.svelte` and `.astro` readers, and the plugins' syntax visitors. Review fixes D5 and D6 (tomer-mayara/choom#94): the settings-file filter tests only names, so it has known misses, which the Stage 2 cookbook lists. For example, it copies `vercel.*` and `dangerfile.*`, and it leaves out one Mastra pattern. A plugin that Knip turns on without a dependency, such as `node` or `yarn`, is recorded in `pluginsNotCopied`, and none of its patterns is copied. |

### Ticket map and order

Tickets with the same order number can run at the same time.

| Order | Ticket | Gap | Needs |
|---|---|---|---|
| 1 | GA-03a Viewer: refuse `path#symbol` as a path | G3 | — |
| 1 | GA-01c Viewer: refuse a baseline that is its own parent | G1 | — |
| 1 | GA-11a CR-004: viewer plan change | G11 | — |
| 2 | GA-00a Create `packages/baseline-model` | setup | — |
| 3 | GA-00b Move the producer into `packages/producer` | setup | GA-00a |
| 4 | GA-00c Producer uses the shared baseline rules | setup | GA-00b |
| 4 | GA-00d CI `producer` job and `@docker` tag | setup | GA-00b |
| 4 | GA-00e Record and check the producer code digest | setup | GA-00b2 |
| 4 | GA-DOC Change the design text to match the decisions | docs | — |
| 5 | GA-12 Do not save hidden reasoning | G12 | GA-00b |
| 5 | GA-09 Named parsing profile | G9 | GA-00b |
| 5 | GA-04 Git identity | G4 | GA-00b |
| 5 | GA-05 ripgrep search | G5 | GA-00b |
| 5 | GA-06a ts-morph project on the snapshot | G6 | GA-00b |
| 5 | GA-10a Convert the Stage 4 graph helper | G10 | GA-00d |
| 6 | GA-10b Module kind of the emitted code | G10 | GA-10a, GA-09 |
| 5 | GA-01a Decision file | G1 | GA-00c |
| 6 | GA-06a2 Stages 4 and 5 use the snapshot project | G6 | GA-06a |
| 6 | GA-06b Definition and reference queries | G6 | GA-06a |
| 6 | GA-01b Make the next baseline version | G1 | GA-01a |
| 6 | GA-03b Symbol selectors in `formatVersion: 5` | G3 | GA-00a, GA-03a |
| 6 | GA-07a Entry rule engine | G7 | GA-06a |
| 7 | GA-02a Symbol selectors divide files | G2, G3 | GA-03b, GA-06a2 |
| 7 | GA-07b–e Rules for each kind of target | G7 | GA-07a |
| 7 | GA-07f Resource access by receiver type | G7 | GA-06b, GA-06a2 |
| 7 | GA-11b Viewer shows discovery questions and gaps | G11 | GA-11a, GA-00a, GA-01a |
| 8 | GA-02b Dependencies of file parts | G2 | GA-02a, GA-06b |
| 8 | GA-08 Knip plugins without settings files | G8 | GA-00d, GA-07e |

---

### GA-03a Viewer: refuse `path#symbol` as a path

**Gap:** G3. The viewer accepts `src/a.ts#decode` as a path today.
**Needs:** nothing.

Add one row to the Scenario Outline "Reject invalid baseline data" in
`cookbook/behavior/baseline-viewer/validation.feature`:

```gherkin
      | a symbol written as a membership path        |
```

It fails today because `isSelector` (`src/domain/baseline.ts:8-13`) accepts `#`.

**Steps:**

1. **U** In `test/unit/domain/baseline.test.ts`, `paths: ["src/a.ts#decode"]`
   and `excludePaths: ["src/a#b/**"]` are refused with the selector message.
2. Add `#` to the characters that `isSelector` refuses.
3. **U** The fixtures in `test/fixtures/baseline-viewer/` still pass.
4. Add the rule to the path rules in `record-format.md`.

### GA-01c Viewer: refuse a baseline that is its own parent

**Gap:** G1 (viewer part). **Needs:** nothing.

Add one row to the same Scenario Outline:

```gherkin
      | a parent version ID equal to its own ID     |
```

It fails today because `src/domain/baseline.ts:159` accepts any string.

**Steps:** **U** A baseline with `parentId` equal to `id` is refused, and the
error names `parentId`. Make it pass in `src/domain/baseline.ts`.

### GA-11a CR-004: viewer plan change

**Gap:** G11 (D17, D20). **Type:** document. There is no behavior test; check
the text and links.

Write `docs/change-requests/CR-004-discovery-in-viewer.md`:

- The viewer can open a fixed `discovery.yaml` whose `baselineRef` and
  `baselineDigest` match the open baseline. It refuses other discovery files.
- It shows the recorded questions and gaps, and the components they name. It
  reads no other file, loads no source evidence and runs no checks.
- It can copy a decision-file entry (GA-01a format) for one statement. It never
  changes a baseline.
- Change the design sections "Report views" and "Compatibility" to match.

**Done when:** the owner approves the CR-004 text. (D20 is already approved.)

---

### GA-00a Create `packages/baseline-model`

**Gap:** setup (D8). **Type:** refactor. Behavior does not change.

**Characterization:** before you move code, all scenarios in these files pass:
`validation.feature`, `interface-documentation.feature`, `source-usage.feature`
and `system-entry-points.feature`. They must also pass after the move.

**Steps:**

1. Add `"workspaces": ["packages/*"]` to the root `package.json`.
2. Move `src/domain/baseline*.ts`, `baseline-statements.ts` and
   `readonly-data.ts` to `packages/baseline-model/src/`. Move their tests to
   `packages/baseline-model/test/unit/`.
3. Add `packages/baseline-model/src/generated` to the output folders in
   `scripts/contracts/generate.ts`. Run `bun run contracts:generate`.
4. Change the viewer to import `@choom/baseline-model`. The duplication and
   starter files stay in `src/domain`.
5. Add the new tests to `bun run test`.
6. **N** Node 26 can import `@choom/baseline-model` directly and validate a
   fixture. This proves that the package uses only plain TypeScript that Node
   can run (the producer runs on Node).
7. Add a dependency-cruiser rule: `packages/baseline-model` imports no app code.
8. Move the four feature-file links and the baseline `.tsp` links to
   `packages/baseline-model/component.yaml`. Link it as a child of the root
   manifest.

**Done when:** the characterization scenarios, `bun run check:contracts` and
`bun run check` pass.

### GA-00b Move the producer into `packages/producer`

**Gap:** setup (D1, D3–D6). **Type:** refactor. Behavior does not change.
**Needs:** GA-00a.

**Characterization scenarios** (`cookbook/behavior/producer/recovery.feature`).
These pass on the current code before the move:

```gherkin
@producer
Feature: Recover an architecture baseline with the producer
  The producer saves a checked baseline and discovery result from one snapshot.

  Scenario: Save a recovered baseline from reviewed Stage 5 records
    Given a reviewed Stage 5 draft for a small fixture repository
    When the operator saves the result
    Then a fixed baseline and discovery result are saved by digest
    And every statement in the baseline stays proposed
    And the run records that recovery is complete

  Scenario: Refuse records that fail the completion checks
    Given a reviewed Stage 5 draft in which a file has two owners
    When the operator saves the result
    Then nothing is saved
    And the operator is told which file has two owners
```

**Steps:**

1. **N** Move `test/interface/entry-points/producer-publication.test.mjs` and
   the duplication interface tests without changes. They must pass on the
   current code.
2. **U** Add characterization tests for `validateRecords`, the Stage 4/5
   publisher and the Stage 1–3 `finish` checks. Use small records in memory.
   Record the current behavior that later tickets change: unknown
   `subjectRefs` pass, and a component ID equal to the baseline ID passes at
   Stage 4/5.
3. Move all `.mjs` and `.py` files from `docs/design/app-a/` to
   `packages/producer/src/`.
4. Move each code block that a stage runs from a cookbook into its own module.
   The stage commands import those modules. They no longer read a saved
   cookbook copy. In this ticket the run still saves copies of the source
   files, as today (GA-00e changes that).
5. Add one CLI, `packages/producer/src/cli.ts`. The root script
   `"producer": "node packages/producer/src/cli.ts"` runs it.
6. Declare the producer's dependencies in `packages/producer/package.json`:
   `yaml`, `picomatch`, `typescript`, `ts-morph`, `knip` and
   `dependency-cruiser`. This fixes defect 3.
7. Change the cookbooks and `start-here.md` to use the CLI. The cookbooks keep
   commands and review steps only.

**Constraints:** add `packages/producer/component.yaml` (behavior,
architecture, contracts). Add a dependency-cruiser rule: the producer can
import `@choom/baseline-model` and no app code. Add the suites to `bun run test`.

### GA-00c Producer uses the shared baseline rules

**Gap:** setup (D8, D9), and defect 1. **Needs:** GA-00b.

Add to `recovery.feature`:

```gherkin
  Scenario: The producer and the viewer agree on a baseline
    Given a reviewed Stage 5 draft
    When the operator saves the result
    Then the viewer accepts the saved baseline without errors

  Scenario: A reserved ID is refused before Stage 5 closes
    Given a Stage 4 draft with a component whose ID is the baseline ID
    When the operator publishes the Stage 4 draft
    Then the draft is refused
    And the operator is told which ID is reserved
```

The second scenario fails today (defect 1).

**Steps:**

1. **U** A Stage 4 publish with a component ID equal to the baseline ID is
   refused. Change the characterization test from GA-00b on purpose.
2. Convert `stage-6-records.mjs` to TypeScript (rule 5).
3. **N** Replace its baseline-shape checks with calls to
   `@choom/baseline-model`. Keep the producer rules on top, as a "producer
   profile": at least one component, a non-null `purpose` and
   `groupingReason`, and non-empty `paths`.
4. **N** The producer profile refuses each of those cases with its own message.
5. **N** The first scenario: the saved baseline passes `decodeBaselineYaml`.

### GA-00d CI `producer` job and `@docker` tag

**Gap:** setup (D18). **Type:** configuration. There is no behavior test.

**Steps:**

1. Add a `docker` profile to `cucumber.mjs` for `@docker` scenarios. Exclude
   `@docker` from the `native` profile.
2. Add `bun run test:producer:docker`. It runs the `docker` profile and the
   container test suites, including the existing Stage 4 graph fixture.
3. Add a `producer` job to `.github/workflows/ci.yml` on `ubuntu-latest` that
   runs that command.
4. Check it: the job passes on a draft branch, and `bun run check` passes on a
   computer without Docker.

### GA-00e Record and check the producer code digest

**Gap:** setup (D7, E7, E8). **Needs:** GA-00b2 (see "Changes during
implementation", item 2).

Add to `recovery.feature`:

```gherkin
  Scenario: The run records which producer code ran
    Given a new run
    When the operator starts Stage 1
    Then the run records the producer version and a digest of its code

  Scenario: A changed producer cannot continue a run
    Given a run that started with one version of the producer code
    And the producer code has changed since then
    When the operator starts the next stage action
    Then the action is refused
    And the operator is told that the producer code changed
```

It fails today because runs save copies of the source files and record no code
digest.

**Steps:**

1. **U** `producerCodeDigest(root)` is stable for the same files and changes
   when any file in `packages/producer/src` or `packages/baseline-model/src`
   changes.
2. **U** The receipt has the package version, the digest, and the Git commit or
   `not-available`.
3. **U** Each stage action compares the current digest with the receipt and
   refuses a difference.
4. Remove the code that saves source copies in each run. Later actions run
   from the checkout after the digest check.

### GA-DOC Change the design text to match the decisions

**Gap:** design drift and D9. **Type:** document. Check the text and links.

Change `docs/design/llm-led-architecture-analysis.md`:

- **Producer profile (D9):** at least one component, a non-null purpose and
  grouping reason, and paths on every component. Fix the discovery example
  (lines 675–680): add `steps` and `limits`.
- **Format versions:** add version 4 and link CR-003. Add version 5 when GA-03b
  merges.
- **Who accepts (D10):** say that "an LLM cannot accept its own proposal" is a
  process rule that a named decider supports, and that code cannot prove it.
- **New version (D12):** say that re-mapping a new version is later work.
- **Other errors:** "eight families" versus "seven-family"; add the two
  duplication sections to Contents.

Also correct `record-format.md:89`, `step-6-cookbook.md:15-17` and
`start-here.md:75` ("versions 2/3", "three versions"). Replace the old BV-05
table in `cr-baseline-viewer-plan.md` with a link to the readability plan.

---

### GA-12 Do not save hidden reasoning

**Gap:** G12 (design 475). **Needs:** GA-00b.

```gherkin
@producer
Feature: Save only the visible LLM response

  Scenario: A response with a reasoning block is refused
    Given an LLM call record whose saved response contains a reasoning block
    When the operator finishes the stage
    Then the stage is not published
    And the operator is told to save only the visible response

  Scenario: A visible response is accepted
    Given an LLM call record whose saved response has only the visible answer
    When the operator finishes the stage
    Then the stage is published
    And the call record says that hidden reasoning was not saved
```

It fails today because no stage checks this, and the cookbooks ask for the
"complete response".

**Steps:**

1. **U** `checkVisibleResponse(text)` refuses a `<thinking>`, `<reasoning>`
   or `<redacted_thinking>` block at the top level of the saved text (outside
   fenced code). When the saved text is a pasted provider JSON response, it
   also refuses content blocks of type `thinking`, `redacted_thinking` or
   `reasoning`.
2. **U** The call record must have `hiddenReasoning: "not-saved"`. A missing
   value or another value is refused.
3. **U** Every action that saves an LLM call uses this one check: the
   `finish` actions of Stages 1–3, the Stage 4/5 publisher and Stage 6.
4. In the cookbooks and `record-format.md`, change "complete response" to
   "complete visible response. Do not save hidden reasoning."

### GA-09 Named parsing profile when there are no project settings

**Gap:** G9 (design 768–769). **Needs:** GA-00b.

```gherkin
@producer
Feature: Parse a project without compiler settings

  Scenario: A project without settings uses the named profile
    Given a saved snapshot with JavaScript and TypeScript files and no compiler settings
    When the operator records the project settings
    Then the settings record names the Choom parsing profile and its version
    And it lists the assumptions of that profile
    And a gap says that no project settings were found
```

**Steps:**

1. **U** `choomDefaultProfile` (`choom-default-v1`) has fixed compiler options
   (`allowJs`, `jsx: preserve`, `moduleResolution: bundler`, module and target)
   and a list of its assumptions in plain text.
2. **U** `readProjectSettings` returns the profile and the gap when the
   inventory has no `tsconfig.json` and no `jsconfig.json`.
3. **U** A `jsconfig.json` is read like a `tsconfig.json`. The profile is not
   used then.
4. **U** Stage 4 and GA-06a use the profile's options when the settings record
   names it.

### GA-04 Record Git identity with the snapshot

**Gap:** G4 (design 458), identity only (D19). **Needs:** GA-00b.

```gherkin
@producer
Feature: Save Git identity with a snapshot

  Scenario: A Git repository records its commit and local changes
    Given a target repository with one commit and one file changed after it
    When the operator captures a snapshot
    Then the snapshot record names the commit
    And it lists the changed file

  Scenario: A folder without Git is still captured
    Given a target folder that is not a Git repository
    When the operator captures a snapshot
    Then the snapshot is captured
    And a gap says that Git evidence is not available
```

**Steps:**

1. **U** `gitIdentity(runGit)` uses a test double for Git. It returns the
   commit, the branch and the changed paths, or `not-available` with a reason.
2. **U** It runs only `version`, `rev-parse`, `symbolic-ref` and `ls-tree`,
   never `status` (plan change 9). Every command sets
   `-c core.fsmonitor=false -c core.hooksPath=/dev/null`,
   `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`,
   `GIT_OPTIONAL_LOCKS=0` and the fetch and replace settings of plan change
   9, so target settings cannot run a program. The changed paths come from
   a comparison of the snapshot with the commit. The test double refuses
   any other command or a missing setting.
3. **U** A Git refusal (for example, "dubious ownership") gives `not-available`
   with Git's message. It does not stop the capture.
4. **N** Run it on a temporary real repository. The record is saved by digest
   and appears in the tool-call record.
5. **U** Stage 1 `finish` adds the `git-unavailable` gap when needed, with
   `toolGaps` from GA-09 (plan change 8).

### GA-05 Search the snapshot with ripgrep

**Gap:** G5 (design 741). **Needs:** GA-00b.

```gherkin
@producer
Feature: Search the saved snapshot

  Scenario: Find a name in a configuration file
    Given a saved snapshot whose deployment file names a worker script
    When the operator searches the snapshot for that script name
    Then the result lists the file, line and text of each match
    And it records the searched scope and the ripgrep version

  Scenario: A search with no match records what was searched
    Given a saved snapshot
    When the operator searches for text that is not in it
    Then the result says that there is no match
    And it names the searched files and the capture exclusions
```

**Steps:**

1. Add `@vscode/ripgrep` at an exact version (E10, plan change 10).
   **N** After `bun install`, the program exists
   and reports its version.
2. **U** `ripgrepArgs(query, snapshotRoot)` always has `--fixed-strings`
   (unless the operator asks for a pattern), `--no-config`, `--json`,
   `--hidden` and `--no-ignore`, and the snapshot root as the only path.
3. **U** The parser turns `--json` output into matches. It refuses a match
   whose path is not in the inventory.
4. **U** The result is `match`, `no-match` or `truncated`, with the limits.
5. **N** Run it on a fixture snapshot. Record the version in the toolchain receipt.

### GA-06a ts-morph project on the saved snapshot

**Gap:** G6 (design 742, 876). **Needs:** GA-00b.

Stage 1 already uses the ts-morph in-memory file system for settings. This
ticket uses it for Stages 3–5 too.

```gherkin
@producer
Feature: Read source structure from the snapshot

  Scenario: List the exports of a source file
    Given a saved snapshot with a file that exports a function and a type
    When the operator asks for the exports of that file
    Then the result lists both exports with their kinds and source ranges

  Scenario: A missing declaration file is a gap
    Given a saved snapshot whose compiler settings name a declaration file that was not captured
    When the operator opens the source project
    Then the project opens
    And a gap names the missing declaration file
```

**Steps:**

1. **U** `openSnapshotProject(snapshot, settings)` makes a ts-morph `Project`
   on an in-memory file system. It holds only snapshot files with checked digests.
2. **U** A read outside the snapshot returns "not found" and is recorded. It
   never reads the disk.
3. **U** `listExports(file)` returns names, kinds and ranges.
4. **U** Missing compiler inputs become gaps.
5. Replace the `ts.createSourceFile` call of Stage 3 `collect` with this
   project. The characterization tests still pass. Stages 4 and 5 move in
   GA-06a2 (plan change 11).
6. **N** The operator action `stage-3 exports PATH` saves `exports-NNN.json`
   with a receipt, as `stage-3 text-search` does. The Stage 3 finalizer
   checks the receipt.

### GA-06a2 Stages 4 and 5 use the snapshot project

**Gap:** G6. **Needs:** GA-06a. No new behavior, so there is no new scenario.
The characterization tests are the acceptance check.

**Steps:**

1. **N** Add characterization tests for `stage-4-inspect.mjs`,
   `stage-5-query.mjs` and `stage-5-commands.mjs` where they are missing.
   They pass on the `.mjs` files.
2. Convert the three files to TypeScript with no behavior change (rule 5,
   plan change 12). The tests pass before and after.
3. Replace the `ts.createSourceFile` calls of Stage 4 inspect and Stage 5
   query with the snapshot project of GA-06a, and load ts-morph as a
   trusted tool of both stages. The matches and their lines stay the same.
   Only the fields that name the parser and the tools change.

### GA-06b Definition and reference queries

**Gap:** G6 (design 742, 880–881). **Needs:** GA-06a.

```gherkin
@producer
Feature: Find where a symbol is used

  Scenario: Find the users of an exported function
    Given a saved snapshot where "createInvoice" is exported from one file and used in two other files
    When the operator asks for references to "createInvoice"
    Then the result lists the two files with source ranges
    And it records the compiler settings that the query used

  Scenario: A computed import makes the result incomplete
    Given a saved snapshot where one file loads the module by a computed name
    When the operator asks for references to "createInvoice"
    Then that file is listed as a possible use that is not resolved
    And the result says that the list may be incomplete
```

**Steps:**

1. **U** `findReferences(project, file, symbol)` returns references with ranges
   and a kind: call, type or re-export.
2. **U** It follows re-exports and aliases.
3. **U** Computed loading sites from the Stage 4 import-site record become
   `unresolved` entries.
4. **U** The result records the scope, the compiler context, the limits and the
   outcome. Completeness is `partial` when there are unresolved entries.
5. **N** Run it through the query command on a fixture snapshot.

### GA-10a Convert the Stage 4 graph helper to TypeScript

**Gap:** G10 (plan change 15). **Needs:** GA-00d. No new behavior, so there is
no new scenario. The characterization tests are the acceptance check.

**Steps:**

1. **N** Add characterization tests for `stage-4-graph.mjs` that run here
   without Docker. They pass on the `.mjs` file.
2. Convert the helper to TypeScript with no behavior change (rule 5). It
   imports only Node built-ins at run time, so the graph image needs only this
   one file. Stage 4 mounts it so that Node runs it as an ES module.
3. **N** Pin today's edges for an ES module package, a TypeScript project with
   `module: commonjs` and a TypeScript project with `module: nodenext`,
   including the wrong edges that GA-10b changes.
4. **D** The Docker test checks that the helper writes nothing to stderr in
   the image fixture run and in the graph run. The CI `producer` job runs it.

### GA-10b Resolve imports by the module kind of the emitted code

**Gap:** G10 (design 866), plan change 16. **Needs:** GA-10a, GA-09.

```gherkin
@producer
Feature: Resolve imports by module kind

  Scenario: An ES module file uses the import condition only
    Given a package with type "module" that imports a dependency with separate import and require targets
    When the dependency graph is built
    Then the edge points to the import target only

  Scenario: A CommonJS file uses the require condition only
    Given a ".cjs" file in the same package that requires the same dependency
    When the dependency graph is built
    Then the edge points to the require target only

  Scenario Outline: TypeScript that compiles to CommonJS uses the require condition
    Given a package without a type field
    And a TypeScript file <file> with compiler module <module> that imports the same dependency
    When the dependency graph is built
    Then the edge points to the require target only
    And the edge is not marked as pre-compilation only

    Examples:
      | file     | module   |
      | main.ts  | commonjs |
      | plain.ts | nodenext |
      | kind.cts | nodenext |

  Scenario: TypeScript that compiles to an ES module keeps the import condition
    Given a package without a type field
    And a TypeScript file "esm.mts" with compiler module nodenext that imports the same dependency
    When the dependency graph is built
    Then the edge points to the import target only
```

The first two scenarios pass today and guard the JavaScript rules. The others
fail today because the graph resolves every TypeScript `import` with the
`import` condition.

**Steps:**

1. **U** `emittedKind(path, compilerModule, nearestPackage)` gives the module
   kind of the code that runs: `.mts` is an ES module and `.cts` is CommonJS.
   For `.ts` and `.tsx`, `commonjs` gives CommonJS and `es2015` to `esnext`
   give ES modules. `node16`, `node18`, `node20` and `nodenext` use the `type`
   of the nearest `package.json` in the snapshot (default `commonjs`).
   `preserve`, no setting, and JavaScript files keep the syntax as written.
   The record says which rule decided, and names the setting or the
   `package.json`. A `package.json` that cannot be read gives an unknown kind
   with a reason.
2. **U** In a file that compiles to CommonJS, `import` and `export ... from`
   statements resolve with the `require` condition. A dynamic `import()` does
   too with `module: commonjs`, and keeps the `import` condition with `node16`
   to `nodenext`, as TypeScript emits it. Type-only imports stay
   `pre-compilation-only`.
3. **U** Change the graph helper checks so that a pass can read `import` syntax
   with the `require` condition for these files only. Every other file keeps
   today's passes.
4. **N** The scenarios above, with the checkout's dependency-cruiser. The pinned
   GA-10a edges change on purpose.
---

### GA-01a Decision file for accepting and correcting statements

**Gap:** G1 (design 152–160, 615–616), D10, D11. **Needs:** GA-00c.

```gherkin
@producer
Feature: Record human decisions about a baseline
  Only a decision by a named person can accept or correct a statement.

  Scenario: A person accepts selected statements
    Given a saved baseline with proposed statements
    And a decision file in which a named person accepts two of the statements
    When the decisions are recorded
    Then the record names the person, the time and the two statements

  Scenario: A person corrects a statement
    Given a saved baseline in which the Billing purpose is proposed
    And a decision file that corrects the Billing purpose
    When the decisions are recorded
    Then the record keeps the old value, the new value and the person

  Scenario: The model of the run cannot decide
    Given a decision file whose decider is a model named in the run's LLM records
    When the decisions are recorded
    Then the decisions are refused

  Scenario: A correction of an old value is refused
    Given a decision file whose correction names a value that the baseline does not have
    When the decisions are recorded
    Then the decisions are refused
    And the operator is told which statement is different
```

It fails today because the producer has no decision record.

**Steps:**

1. **I** Add TypeSpec `BaselineDecisions` in `@choom/baseline-model`
   (`cookbook/interfaces/baseline-decisions.tsp`). Fields: `formatVersion`,
   `id`, `baselineRef`, `baselineDigest`, `decider { name, kind: "human" }`,
   `decidedAt`, and `entries`. An entry is `{ action: "accept", itemId, field }`
   or `{ action: "correct", itemId, field, oldValue, newValue }`. Test valid and
   invalid shapes. (The viewer uses the same contract in GA-11b.)
2. **U** `validateDecisions` refuses a field that is not in the named baseline,
   a digest that does not match, and two entries for one statement.
3. **U** It refuses a correction whose `oldValue` is not the current value.
4. **U** It refuses a decider whose name matches a `model` value in the LLM
   call records of the run folder.
5. **N** `bun run producer baseline decide --run <folder> <file>` checks the
   file and saves it once, by digest. A second save with the same ID fails.

### GA-01b Make the next baseline version

**Gap:** G1 (design 158–160, 413–421), D12. **Needs:** GA-01a.

```gherkin
@producer
Feature: Make a new baseline version

  Scenario: Recorded decisions make a new version
    Given a saved baseline and a recorded decision that accepts two statements and corrects one
    When the operator makes the next baseline version
    Then the new version names the earlier version as its parent
    And the decided statements are accepted and refer to the decision record
    And the corrected statement has the new value
    And the earlier version and its discovery result do not change

  Scenario: The viewer accepts the new version
    Given a baseline version made from recorded decisions
    When a caller validates it for viewing
    Then the decided statements are accepted with their reference
```

**Steps:**

1. **U** `nextBaselineVersion(parent, decisions)` returns a new ID with
   `parentId` set to the parent's ID.
2. **U** Only the decided statements change. Each gets `status: accepted` and
   `acceptanceRef` set to the decision record ID. A correction also replaces
   the value.
3. **N** The producer profile accepts an `accepted` statement only when its
   `acceptanceRef` names a saved decision record with an entry for that
   statement. This replaces the "proposed only" rule. Change the
   characterization test.
4. **N** The CLI saves the new version by digest. The parent's digest is the
   same before and after.
5. **N** The second scenario uses `@choom/baseline-model`. The viewer code does
   not change.

---

### GA-03b Symbol selectors in `formatVersion: 5`

**Gap:** G3 (design 147), D13. **Needs:** GA-00a, GA-03a.

```gherkin
@baseline-viewer
Feature: Read symbol membership

  Scenario: The viewer shows a component that owns named symbols
    Given a version 5 baseline in which Pricing owns the symbol "computePrice" in a shared file
    When the user opens the Pricing details
    Then the membership shows the file path and the symbol name

  Scenario: Symbol selectors need version 5
    Given a version 4 baseline with a symbol selector
    When a caller validates it for viewing
    Then validation names the membership selector that is not supported
```

**Steps:**

1. **I** In `baseline.tsp`, version 5 is version 4 plus `symbols?: [{ path,
   symbol }]` in the membership value. Regenerate and run
   `bun run check:contracts`.
2. **U** In `baseline-model`: `path` follows the path rules, `symbol` is an
   identifier or `default`, there are no duplicates, and versions 1–4 refuse
   the field.
3. **U** Version 5 uses the version 3 and 4 arrow rules (`interface-arcs.ts`).
4. **U** (DOM) `architecture-details.tsx` lists the symbols under membership.
5. **A** Add a fixture and a browser step.

### GA-02a Symbol selectors divide files

**Gap:** G2 and G3 (design 174–188), D13. **Needs:** GA-03b, GA-06a2.

```gherkin
@producer
Feature: Divide a file by named symbols

  Scenario: A named symbol becomes its own code unit
    Given a file that Billing owns and that also declares "computePrice"
    And Pricing names the symbol "computePrice" in its membership
    When the code mapping is checked
    Then "computePrice" is a code unit that Pricing owns
    And the rest of the file is one code unit that Billing owns

  Scenario: The rest of a file without a path owner has an unknown owner
    Given a file that no path selector matches
    And Pricing names the symbol "computePrice" in that file
    When the code mapping is checked
    Then the rest of the file has an unknown owner and a reason

  Scenario: A symbol that the file does not declare is refused
    Given a component that names a symbol that the file does not declare
    When the code mapping is checked
    Then the mapping is refused
    And the operator is told which selector matched nothing

  Scenario: Two components cannot own one symbol
    Given two components that name the same symbol
    When the code mapping is checked
    Then the mapping is refused
```

It fails today because every unit must be a whole file and symbols are refused.

**Steps:**

1. **I** Extend the code-mapping contract: `unitKind` is `file`, `symbol` or
   `rest`. A `symbol` or `rest` unit has `fileRef`, `range` and `owner`. A
   `symbol` unit also has `symbol`.
2. **U** `divideFile(sourceFile, symbolNames)` returns one range for each named
   top-level declaration (with its leading comments) and one `rest` unit for
   all other text. The ranges cover the file and do not overlap.
3. **U** Function overloads form one unit. An anonymous `export default` is
   the symbol `default`. A declaration with several names (`export const a = 1,
   b = 2`) cannot be a symbol unit: it is refused with a clear message.
4. **U** A name that is not a top-level declaration is refused.
5. **U** The `rest` owner is the path owner, or `null` with the reason
   `no-path-owner`.
6. **N** The producer profile refuses two owners for one symbol, and a file that
   is both a `file` unit and divided.
7. **N** Stage 5 writes a version 5 baseline and the divided mapping for a
   fixture snapshot.

### GA-02b Dependencies of file parts

**Gap:** G2 (design 184–188). **Needs:** GA-02a, GA-06b.

```gherkin
@producer
Feature: Keep the dependencies of divided files

  Scenario: An import used by one part belongs to that part
    Given a divided file in which only the "computePrice" part uses an imported module
    When the dependencies of the divided file are recorded
    Then the import belongs to the "computePrice" part

  Scenario: A dependency that cannot be placed stays at file level
    Given a divided file with a computed import in its setup code
    When the dependencies of the divided file are recorded
    Then the dependency is recorded at file level as not resolved
    And it is not dropped and not copied to every part
```

**Steps:**

1. **U** An import belongs to a part when all references to its names are in
   that part.
2. **U** An import with references in several parts, or with no references,
   stays at file level with the reason `shared` or `unreferenced`.
3. **U** Computed imports and side-effect imports stay at file level as not
   resolved.
4. **N** The Stage 5 query output lists dependencies at both levels.

---

### GA-07a Entry rule engine

**Gap:** G7 (design 877–880), D14. **Needs:** GA-06a.

```gherkin
@producer
Feature: Find behavior entry candidates

  Scenario: A rule finds a candidate
    Given a saved snapshot that calls a registration function from the rule list
    When the operator collects behavior entry candidates
    Then a candidate names the rule, the entry kind, the call site and the handler range
    And it is marked as found by a syntax rule, not as a proven entry

  Scenario: A computed name stays unknown
    Given a saved snapshot in which the registered name is made at run time
    When the operator collects behavior entry candidates
    Then the candidate has an unknown name and a reason
```

**Steps:**

1. **I** Rule-list contract. Each rule has `id`, `version`, `library`,
   `entryKind` and one of two kinds:
   - `call`: `importName`, `callPath` (a `new` call is allowed),
     `nameArgument` and `handlerArgument`.
   - `settings-literal`: `fileGlob` and `propertyPath` (for example
     `build.rollupOptions.input`).

   The list is pinned, and its digest goes in the run record.
2. **U** A `call` rule matches calls whose receiver comes from the named import.
3. **U** A literal name is recorded. Any other name is `null` with a reason.
4. **U** A handler that is a name resolves to its declaration range. An inline
   function uses its own range.
5. **U** A `settings-literal` rule reads the literal value at the property path
   with ts-morph. It never runs the file. A value that is not a literal becomes
   a gap.
6. **U** A match in a test file gets the role `test`.
7. **N** Stage 4 writes `behaviorEntries` into the entry analysis, and
   `validateRecords` checks their ranges. Add `behaviorEntries` to
   `record-format.md`.

### GA-07b to GA-07e Rules for each kind of target

Each ticket adds rule data and one fixture scenario to the GA-07a feature file.
The engine code does not change. If a fixture needs a new engine feature, first
write a failing unit test for the engine.

| Ticket | Rule data | The scenario's Then |
|---|---|---|
| GA-07b HTTP servers | Express, Fastify and Hono route methods (`call`) | A route candidate names the method, the path and the handler. |
| GA-07c Workers and queues | `node:worker_threads` `new Worker(...)` and BullMQ `new Worker(queue, handler)` (`call`) | A worker candidate names the worker file or queue and the start site. |
| GA-07d CLI tools | commander and yargs `.command(...)` (`call`); package `bin` entries linked to source with evidence | A command candidate names the command and its action range. |
| GA-07e Frontend settings | Entries in `vite.config.*` and `next.config.*` (`settings-literal`) | The entry from the settings file is a candidate. A computed entry is a gap. |

### GA-07f Resource access by receiver type

**Gap:** G7 (design 240–245, 877–878). **Needs:** GA-06b, GA-06a2.

```gherkin
@producer
Feature: Find resource access sites

  Scenario: Find a database write through a typed client
    Given a saved snapshot in which a service writes to the invoices table through a database client
    When the operator collects resource access sites
    Then the access site names the write operation, the table name and the source range
    And the table identity is marked as inferred, not proven
```

**Steps:**

1. **U** Use the type checker to find the receiver's type, not only the method name.
2. **U** Record the operation, the name expression (a literal, or `null` with a
   reason) and the runtime context.
3. **U** Keep the matches that use only a method name, with confidence
   `name-only`.
4. **N** The `resourceAccessRef` record keeps observed access separate from
   inferred ownership.

---

### GA-08 Knip plugins without settings files

**Gap:** G8 (design 782–792), D15. **Needs:** GA-00d, GA-07e.

**Changed by plan change 17:** D23 replaces D15. Steps 2 and 5 copy the plugin patterns. No plugin is turned on.

```gherkin
@producer @docker
Feature: Use Knip plugins without running target settings

  Scenario: A framework entry found by its file-name pattern
    Given a saved snapshot of a frontend project whose entry file follows the framework's naming pattern
    When the operator runs entry analysis
    Then the entry is a candidate that names the plugin as its source

  Scenario: A settings file is never loaded
    Given a saved snapshot whose framework settings file is a script
    When the operator runs entry analysis
    Then the settings file is not loaded
    And an entry named only in that file comes from the settings rules or is a gap
```

It fails today because every plugin is set to `false`.

**Steps:**

1. **D** Test D15 first. With Knip 6.44.1, a plugin set to `{ config: [] }`
   adds its default entries and does not load the settings file. Use a probe
   settings file that would write a marker file if it ran. **If this test
   fails, stop and return to the owner.**
2. **U** `selectPlugins(manifests)` turns on a plugin when its framework
   package is a dependency. It always sets `config: []`.
3. **U** The Knip profile records each plugin that is on, and why.
4. **D** Run the pinned Knip image on a fixture (`--network none --read-only`).
5. **U** Merge the Knip candidates with the GA-07e candidates. Keep both sources.

---

### GA-11b Viewer shows discovery questions and gaps

**Gap:** G11 (design 190–191, 392–394), D17, D20. **Needs:** GA-11a, GA-00a, GA-01a.

**Changed by plan change 18:** GA-11b1 does step 1, the producer part. GA-11b2 does steps 2 to 7, the viewer part.

```gherkin
@baseline-viewer @browser
Feature: Show what the discovery left uncertain

  Scenario: Open a discovery result for the open baseline
    Given an open baseline and a discovery result for it with two questions about Billing and one deferred file
    When the user opens the discovery result
    Then Billing shows two recorded questions
    And the deferred file is listed with its reason
    And the list says that these are recorded questions and gaps, not defects

  Scenario: A discovery result for another baseline is refused
    Given an open baseline and a discovery result with a different baseline digest
    When the user opens the discovery result
    Then the viewer refuses it and keeps the open baseline

  Scenario: Copy a decision for one statement
    Given an open baseline
    When the user copies a decision for the Billing purpose
    Then the copied text is a decision-file entry for that statement
    And the open baseline does not change
```

**Steps:**

1. **I** Producer: Stage 6 writes discovery format version 2 with
   `baselineDigest`. **N** Test that it is the digest of the saved baseline.
2. **I** In `@choom/baseline-model`, a TypeSpec contract for the part of a
   discovery result that the viewer reads: `formatVersion`, `baselineRef`,
   `baselineDigest`, `questions` and `gaps`.
3. **U** The decoder refuses version 1 (D20) and a digest that does not match,
   and keeps gap kinds that it does not know.
4. **U** Subjects that name a component go to that component. All other
   subjects go to an "Unplaced" list. Nothing is refused for an unknown subject
   (E1).
5. **U** The load workflow attaches the discovery result to the open baseline,
   with the same Cancel, Retry and late-result rules as the duplication report.
6. **U** (DOM) A component badge, a details list, a deferred-files group that
   can be collapsed, and a "Copy decision" action that uses `use-example-copy.ts`.
7. **A** Browser steps for the three scenarios.

---

### Not covered by this plan

These findings from the report have no ticket. They need separate tickets if
you want them fixed:

- **Defect 2:** the built-in starter baseline gives `src/domain` and
  `src/platform` files two owners (`src/domain/starter-baseline.ts:10-17`).
  This is a small fix: add `parent` links or `excludePaths`. Fixed in plan
  change 20: the two inner components get the parent `workspace`, and
  `workspace` excludes their files.
- **Defect 4:** the Knip image base tag and its transitive dependencies are not
  pinned (`packages/producer/src/stage-2-tool-image.ts:15`, and the same text
  in `packages/producer/src/stage-4-commands.ts:330`; GA-00b2 moved it out of
  `step-2-cookbook.md`). The owner accepted it on 2026-11-16 (plan change 20):
  each run pins its tool images by the saved image ID.
- **P1–P13:** the partial findings. GA-11b works around P1 (unknown subjects
  become "Unplaced"). GA-00c fixes defect 1. GA-12 and GA-00e touch P7 but do
  not close it (P7 also asks for a prompt-version field, a template check, and
  a check that cited evidence was supplied). Plan change 20 decides each of
  them.

### Open after the final review

Every ticket of this plan has a merged PR (tomer-mayara/choom#58 to
tomer-mayara/choom#91, and tomer-mayara/choom#66 for the plan update). The
review-fix PRs are tomer-mayara/choom#92 to tomer-mayara/choom#95. These
items stay open.

**Owner decisions:** the owner made them on 2026-11-16 (plan change 20). The
owner decides the settings-file filter of review finding D5 after the real run.
The review findings A1 to D6 are named by review area. Review findings D1 to D6
are not the decisions D1 to D6 of the decision log.

**How the stack merged:**

- tomer-mayara/choom#57 was squash-merged, so the stack branches did not hold
  its commit. Instead of a rebase of the stack, `main` (with tomer-mayara/choom#57
  and tomer-mayara/choom#96) was merged into the top branch of the stack. The
  report in `main` had the same bytes as the report that the stack started
  from, so that merge kept the stack's report.
- tomer-mayara/choom#96 fixes the flaky scenario "Reach a large header with the
  keyboard". It merged into `main` first, so the stack has the fix.
- Every PR of the stack then targeted `main`, and tomer-mayara/choom#95 merged
  with a merge commit after its CI passed on the merged tree.
- The heads of tomer-mayara/choom#63 to tomer-mayara/choom#66 keep a test whose
  scratch folder holds a read-only copy, which a runner without root rights
  cannot remove (`EACCES` in `local-checks.test.ts`). GA-00b2
  (tomer-mayara/choom#67) fixes the cleanup. No state of `main` has the failing
  test, because the stack merged with one merge commit.

**Limits that the PRs record and do not fix:**

- Producer:
  - Fixed in plan change 20: `recover-capture.ts` runs the settings collector
    in the tool checkout and records its SHA-256. It still saves
    `inventory.mjs` and a copy of itself as records, and runs neither.
  - Fixed in plan change 21: a probe showed that the Stage 4 and 5 publisher
    registered stray files of an attempt folder. It now refuses them.
  - Stage 2 finish refusals print a stack trace.
  - A bad `%` escape in an evidence reference gives a bare "URI malformed".
- Hidden reasoning (GA-12): a key such as `reasoning_content`, a string field
  named `thinking`, and tags in fenced blocks or inline code are not refused.
- Questions and gaps: Stages 1 to 3 count the 4 MiB text budget only over the
  questions and gaps. A draft near that limit can still fail at Stage 6.
- Entry and resource rules:
  - The rules do not follow a function parameter (`routes(app)`) or a value in
    an object literal.
  - Next.js finds its entries from its folders, and no rule reads them.
  - A global `declare var require` in a snapshot `.d.ts` turns off every
    JavaScript `require` match, with no gap.
  - The deprecated `module` settings None, AMD, UMD and System give the
    `require` condition.
  - `export { config as default }` gives the reason "has no export default".
  - A `package.json` over 64 MiB with a `bin` field gives a candidate that the
    publisher refuses.
  - Stage 1 and Stage 2 refuse a `package.json` with a byte order mark, and
    Stage 4 reads it.
- Code units: the Stage 5 `parts` request is not required, and the site checks
  in a divided file stay at file level.
- Viewer:
  - Lists are not virtualized: 5,000 unplaced records take about 3 s to show.
  - The viewer bundles Inter for Latin text (plan change 20), so the layout is
    the same on each machine. At a root font size of 110%, the plot at 320×640
    with the panel open is 73.5 px, smaller than 100 px. No scenario covers
    110%.
- Copies that a later DRY ticket can share:
  - the safe-path rule (about 12 copies) and the frame-wait helpers of the
    browser tests (7);
  - the trusted-checkout loaders, and `safe`, `directory` and the digest check
    in several producer modules;
  - the bounded YAML reader in the producer and in the viewer;
  - the 4 MiB string budget in the app and in `@choom/baseline-model`;
  - the source-file rule in `stage-3-collect.ts`.

### Status at `86c6100`

Checked again on `main` at `86c6100` (2026-11-21), after CR-005. Draft
tomer-mayara/choom#101 (plan change 20) changes the lines above that record the
owner decisions, Defect 2, Defect 4 and the recovery collector. This section
does not repeat those changes and changes none of those lines, so the two PRs
do not edit the same text.

- **Owner decisions.** On `main`, no record shows the approval of D21 or plan
  changes 18 and 19. Plan change 20 in #101 records them as approved on
  2026-11-16. "D5" in plan change 19 and in "Owner decisions" is review fix D5
  (tomer-mayara/choom#94), not decision D5 of the decision log.
- **Defects.** GA-00c and review fix B7 fixed defect 1. GA-00b fixed defect 3:
  `packages/producer/package.json` declares `picomatch`. Defect 2 is open on
  `main`: 14 files under `src/` have two direct owners, and a parent link alone
  does not remove the second owner. #101 fixes it. In the defect 4 bullet,
  `stage-4-commands.ts:330` is the Stage 4 graph image, not the Knip image.
- **Stray attempt files: confirmed.** A probe put a file that no phase wrote in
  a Stage 4 attempt folder. The publisher registered it in `run.yaml`, and
  `check`, `finish` and `verify` passed (`stage-4-5-publish.ts:186-191, 286-291`).
  Appendix B ticket GB-14 plans the fix.
- **Stage 2 stack trace.** The Stage 2 driver prints a stack trace for its
  refusals before `finish` (`stage-2-commands.ts:525`). The finish module
  prints only the message.
- **4 MiB budget.** Stages 4 to 6 count the whole discovery draft, so a draft
  near the limit can fail at Stage 4, 5 or 6.
- **Code units.** The behavior entry, resource access, source use and system
  entry site checks in a divided file stay at file level. The CR-005 boundary
  checks use the parts.
- **Entry and resource rules.** These limits also hide CR-005 boundary
  operations, because the boundary review reads the GA-07 candidates. Resource
  calls other than those of the 4 knex rules still match by method name only.
- **Viewer lists.** CR-005 adds lists of up to 2,000 accesses and 4,000 notes,
  and the viewer shows them in full. Their speed was not measured. Plan change
  20 says that the viewer bundles Inter; no PR does it yet.
- **Still open and unchanged:** `recover-capture.ts` runs a saved
  `settings.mts` (until #101 merges), the bare "URI malformed" message, the
  hidden reasoning misses, the entry and resource rule limits, and the copies
  for a DRY ticket. CR-005 adds one more bounded reader (`stage-1-project.ts`).
- **Guides.** Commit 44f2b8a replaced `docs/coding-principles.md` and
  `docs/new-feature-cookbook.md`, which "How to work every ticket" and "Test
  types" name, with `docs/engineering-guidelines/`. The tickets followed the
  old guides. Many ticket texts name `.mjs` files and paths that GA-00a and
  GA-00b moved. They stay as written history.
- **Appendix B** plans tickets for P1–P13, as plan change 20 decides.

---

## Appendix B: Partial findings - tickets

Revision 3, 2026-11-21. This plan closes the partial findings P1–P13 as plan
change 20 decides. Plan change 20 records the owner decisions of 2026-11-16. It
is in draft tomer-mayara/choom#101, which is not merged yet. On 2026-11-21 the
owner chose that Appendix B follows it. Revision 2 (commit 3cc3dc1) planned
code tickets for all 13 findings. "Not planned" below lists the tickets that
plan change 20 replaces, with the reason. The decisions in the
[decision log](#decision-log-1) are decided by plan change 20, proposed, deferred
or dropped, as each row says. Revision 2 also corrected the errors of an
independent review, and follows the planning and coding guides that replaced
`docs/coding-principles.md` and `docs/new-feature-cookbook.md` (commit 44f2b8a).

### Changes during implementation (Appendix B)

On 2026-11-21 the owner asked to implement the tickets of Appendix B, and
decided these points:

1. **The next tickets build on tomer-mayara/choom#103.** Draft
   tomer-mayara/choom#103 (plan change 21) made a part of the Step 2 gate before
   Appendix B merged. The ticket work starts from its branch. Where
   tomer-mayara/choom#103 and a ticket differ, the ticket decides. The table
   below gives each difference.
2. **Only the next tickets.** These are GB-01a to GB-14. The draft tickets
   (GB-07a to GB-10) stay drafts until the first real run, as plan change 20
   says.

The tickets follow the proposed rows of the decision log as written: DB1
(details a and b), DB2 (the addition), DB3, DB4, DB5, DB13 and DB14. The owner
approves the changed constraints with the PR, before merge.

What tomer-mayara/choom#103 has, and what each ticket adds to it:

| Ticket | In tomer-mayara/choom#103 | The ticket adds or changes |
|---|---|---|
| GB-01a | `record-subjects.ts` checks each question and gap in the shared record checks of Stages 4 to 6. A folder is written with or without a final `/`. | The shared `SubjectItems` class, the `SubjectChecker` class and the scenarios. The folder form `dir/**` (DB1, detail a) replaces the form of tomer-mayara/choom#103. |
| GB-01b | Nothing. | The full ticket. |
| GB-02a | Nothing. The check of tomer-mayara/choom#103 reads only the steps of an inspected path. | The full ticket. |
| GB-02b | Each step cites a saved source range that is inside a reviewed range. | The component check (step 2) and the scenarios. |
| GB-03 | The Stage 4/5 publisher writes `coverage.inspected` and `coverage.unresolved`. Stage 6 writes record counts under `unresolved`. | `RunSummary` for each publisher and `verify`, the fields `recorded` and `pending` in place of `unresolved` (DB4), and the run manifest contract. |
| GB-04a | Stage 2 `finish` and the shared record checks need a gap that cites an `unsupported` preflight or a `failed` or `skipped` run (`result-gaps.ts`). The reviewer writes that gap. | `ToolGaps`, `required-gaps.json` with reserved IDs, and the exact-copy check of DB5, which replaces the Stage 2 check of tomer-mayara/choom#103. |
| GB-04b | The Stage 3 finalizer needs a gap that cites `unavailable` or `skipped` symbol mentions. | Required gaps for `partial` symbol mentions and for the exports records, and the exact-copy check. |
| GB-04c | Nothing. | The full ticket. |
| GB-04d | The shared record checks cover the Knip results. | The Stage 1, Stage 3 and Stage 4 tool results. |
| GB-12a | `draft-update.ts`: Stage 3 writes `run.yaml` last and rolls back. A fault double (`support/doubles/draft-faults.ts`) and interface tests cover it. | The acceptance scenario, and the cookbook text where it is missing. |
| GB-12b | The same for Stage 2, with an acceptance scenario. | The scenario of the ticket, where it differs. |
| GB-14 | `check`, `finish` and `verify` of Stages 4 and 5 refuse a stray attempt file. | The acceptance scenario, and the probe of the Stage 2, 3 and 6 publishers (step 3). |

**Before the tickets.** The one feature file of tomer-mayara/choom#103,
`completion-checks.feature`, is divided into the five feature files that the
tickets name: `issue-subjects.feature`, `reviewed-evidence.feature`,
`run-manifest.feature`, `tool-gaps.feature` and `draft-publication.feature`.
Each scenario moves unchanged. A ticket then changes or replaces the scenario
of tomer-mayara/choom#103 where its own scenarios cover the same behavior.

**Rounds.** The tickets run in the three rounds of the ticket map, each ticket
on its own branch, with at most four workers at one time. After each round the
manager merges the branches, runs the checks on the combined change and then
starts the next round. GB-12a, GB-12b and GB-14 are one task in round 1,
because tomer-mayara/choom#103 has their code.

**Checks on the combined change:** `bun run check`, `bun run check-types`,
`bun run habit-hooks --all`, `bun run test:producer:docker` and
`bun run test:e2e`.

**State after round 3.** The 12 tickets are done. Each ticket has its
scenarios, its tests and its document changes. The table gives each difference
from the ticket text.

| Ticket | Differences from the ticket text |
|---|---|
| GB-01a | None in the check. A folder subject is compared as text with the folders of the snapshot. Thus `src/app/[id]/**` is a valid subject, although a membership selector cannot contain `[`. |
| GB-01b | None in the check. Stage 2 `finish` also checks the plan records that it adds to the discovery. See "Open after the tickets", item 1. |
| GB-02a | None. |
| GB-02b | The check is stricter than step 1. Each saved source range that a step cites must be a reviewed range. Thus a step that cites one reviewed range and one unread excerpt is refused. A line that two parts share counts for each owner (`MappedOwners.ownsLines`). The guard scenario has other step text. |
| GB-03 | `pending` is a sentence, as the other fields are. The summary no longer counts the inspected paths and the files with unknown owners, which tomer-mayara/choom#103 added. The publisher output and `validation.json` keep these counts. The Stage 3 `verify` also makes the summary again. A test checks only the Stage 1 manifest against the full `RunManifest` schema, because the test fixtures write smaller manifests. `fixtures/entry-points/producer.mjs` is now `producer.ts`. `fixtures/boundary-publication/fixture.ts` writes no `run.yaml`, so step 7 does not change it. |
| GB-04a | More than the ticket. The full prefix `<attempt>-knip-gap-` is reserved. Stage 2 `plan` also refuses these IDs. `finish` makes the required gaps again and refuses a changed `required-gaps.json`. A reason longer than 16 KiB is cut. |
| GB-04b | The ID form of an exports request that failed, and thus saved no record, is not reserved. |
| GB-04c | A compiler input that the two candidate records name gives two required gaps. The limit of 5,000 records of the discovery is not handled for a very large number of settings values that cannot be read. |
| GB-04d | The check is for each tool result, not for each record. A gap that cites one Knip run does not cover the other run. Every kind of tool result has the same message. The check needs a gap that cites the result. The exact copy stays the check of the stage that publishes the record. The refused cases are in `integration/records/stage-6-tool-results.test.ts`, because `stage-6-records.test.ts` is at the line limit. The Stage 4 publication fixture now keeps the settings gap of Stage 1, so it has 2 gaps. The check lists the Stage 4 candidate records that the selected entry analysis and the selected resource observations name. It does not list those of an earlier Stage 4 attempt. |
| GB-12a, GB-12b | Only the scenarios and the cookbook text, because tomer-mayara/choom#103 has the code. One step definition serves "the operator finishes Stage N" for each feature (`test/steps/producer-stage-finish.steps.ts`). |
| GB-14 | The probe showed that the Stage 2 and Stage 3 publishers also registered a stray file. They refuse it now (`SavedAttemptFiles`). The Stage 2 receipts record the digest of each file that a saved command wrote. The Stage 6 message does not name the stray file. |

**Check results on the combined change**, after the review fixes (macOS,
Node 26.13.0, Bun 1.4.4, `TMPDIR` set to its real path):

| Check | Result |
|---|---|
| `bun run check` | Pass: 1,652 unit tests, 299 DOM tests, 248 integration tests, 177 scenarios and 771 interface tests. Lint, the cookbook check, the contract checks, the dependency rules, Knip and the duplicate check pass. |
| `bun run check-types` | Pass. |
| `bun run habit-hooks --all` | Pass. |
| `bun run test:producer:docker` | Pass: 1 test and 2 scenarios. These tests stop at Stage 4 `collect` or at the graph run, so they do not reach the shared record checks of Stages 4 to 6. |
| `bun run test:e2e` | Pass: 368 scenarios. |

**Open after the tickets.** The owner decides these points:

1. **A second Stage 2 attempt orphans earlier subjects.** A Stage 2 entry
   analysis has no `previousEntryAnalysisRef`, and Stage 2 can run again, also
   after Stage 3. The selected history of Stage 4 then has no candidate of the
   earlier attempts. Stage 4 refuses a kept question or gap that names one of
   them, such as a Stage 3 note about a retired candidate. The run must then
   start again. Stages 2 and 3 check only the records that they add (DB2), so
   they accept the kept record. A test shows the Stage 2 part
   (`interface/stage-2/finish-checks.test.ts`). The refusal at Stage 4 follows
   from the code and is not confirmed in a run. See also "Candidate IDs after
   a repeated Stage 2" in "Not covered by Appendix B".
2. **The proposed decision rows.** DB1 (details a and b), the addition of DB2,
   DB3, DB4, DB5, DB13 and DB14 are implemented as written. They stay
   "Proposed" in the decision log until the owner approves them with the PR.
3. **GB-02b is stricter than DB3.** DB3 says that a step can also cite other
   evidence, such as a graph or references record. The code accepts such a
   record. It refuses a step that also cites a saved source range that no
   review read, also when a reviewed range has the same lines. The rule of
   tomer-mayara/choom#103 accepted a cited range inside a reviewed range. The
   stricter rule agrees with GB-02a, where an unread excerpt is not a reviewed
   range. The owner keeps it or changes it to the rule of
   tomer-mayara/choom#103.
4. **The other differences of the table above.** Each stricter check (GB-04a,
   GB-04d, GB-14) and each known limit (GB-01a, GB-04b, GB-04c, GB-04d) stays
   as it is unless the owner decides differently.

**Independent review.** A reviewer that did not write the tickets read the
combined change and ran probes. It found no serious defect. It had four
findings:

- **Fixed.** The Stage 3 finalizer checked the subjects before the copy of the
  required gaps. A review that changed the required gap of an exports record
  got a message about a subject that it must keep. The copy check is now first
  (`stage-3-review.ts`), as in Stages 2 and 4.
- **Fixed.** The Stage 4 review prompt gave the subject rule with no exception
  for a gap that is copied from a tool record. The prompt now gives the
  exception.
- **Recorded.** After a stage publishes, no check refuses a new gap that has
  the reserved ID form of that stage. See "Not covered by Appendix B".
- **Recorded.** GB-02b is stricter than DB3. See item 3 above.

Two smaller items are not part of a ticket. The Stage 4 publication fixture
registers a Git identity record with the status `not-available` and no gap,
which Stage 1 refuses in a real run. And
`packages/producer/test/interface/local-checks.test.ts` fails on macOS when
`TMPDIR` is a path under `/var`, because macOS gives the same folder as
`/private/var`. The test passes when `TMPDIR` is the real path.

### Re-check of the findings at `86c6100`

Appendix A moved the producer to `packages/producer/src/` and changed it. CR-005
(tomer-mayara/choom#97 to tomer-mayara/choom#99) then added baseline version 6,
project-keyed runs and the boundary review. So the evidence in the P table above
is out of date. Three read-only reviews checked each finding again with probes,
on `305db3e`. The evidence below was then checked again on `main` at `86c6100`.
All 13 findings are still open. Appendix A and CR-005 closed parts of P1, P4, P6,
P7 and P8. The design lines are those of the current
`docs/design/llm-led-architecture-analysis.md`.

| # | State now | Current evidence | Design |
|---|---|---|---|
| P1 | Open. The viewer lists an unknown subject as "Unplaced" (GA-11b2, E1). Each stage checks only that `subjectRefs` holds strings. CR-005 checks the subject of an inspection priority only when the priority has a `clue`. | `stage-6-records.ts:295-306`; the same check at `stage-1-commands.ts:383`, `stage-2-finish.ts:207` and `stage-3-review.ts:228`; `stage-3-inspection-clues.ts:25-27` | 764 |
| P2 | Open. A step of an inspected path can cite an excerpt that no review read. A behavior entry or resource access site can cite any record that has the same path and lines, also an excerpt that no reviewed range names. | `stage-6-records.ts:369-384`, `:400-411` | 771 |
| P3 | Open. After Stages 4 and 5, `run.yaml` still says "The baseline is not yet recovered." Stage 6 writes the list lengths of the questions and gaps under `coverage.unresolved`. | `stage-1-commands.ts:463-465`; `stage-4-5-publish.ts:337-341`; `stage-6-commands.ts:322-331` | 463-467, 774-776 |
| P4 | Partly closed. Stage 1 adds the gaps of its Git and settings records (plan change 8). Stage 2 publishes a skipped or failed Knip run with no gap (probe). The Stage 3 symbol mentions and exports records and the Stage 4 candidate records also have outcomes that no gap cites. | `stage-1-gaps.ts:12-20`; `stage-2-finish.ts:263-293`; `stage-3-finish.ts:267`; `record-behavior-candidates.ts:67-75` | 1004 |
| P5 | Open. The run manifest names the baseline only at Stage 6. Tool and model versions and stage times are only in receipts. | `stage-1-commands.ts:456-465`; `stage-6-commands.ts:322-344` | 471 |
| P6 | Partly closed. The ripgrep, exports and references records of GA-05, GA-06a and GA-06b have their scope, limits and output digests. The Stage 1 call records do not. Stage 2 `execute` has no time limit and records none. | `stage-1-commands.ts:71-79`; `stage-2-commands.ts:269-284` | 478-481 |
| P7 | Partly closed. GA-12 and review fix B4 refuse hidden reasoning. No call record has a prompt version, and no saved prompt is compared with its template. Only Stage 1 checks that the cited evidence was supplied. Six places check a call record. | `stage-1-commands.ts:326-333, 413-437`; `stage-2-commands.ts:338-340, 458`; `stage-3-review.ts:197-204`; `stage-4-5-publish.ts:271-282`; `stage-6-records.ts:439-468` | 476 |
| P8 | Open. Four checks resolve the evidence of an entry candidate and do not read the value. A probe: a candidate `app.ts` that cites the package name passes. CR-005 `knipClaims` check only a claim about a Knip report (`stage-2-candidate-claims.ts`), not the expression or path. | `record-checks.ts:76`; `stage-2-commands.ts:169`; `stage-2-finish.ts:227-242`; `stage-3-review.ts:239-268`; `stage-6-records.ts:349-356` | 855-856 |
| P9 | Open. A deferral is a gap whose `kind` is free text. Nothing links it to a search. The Stage 3 cookbook still names an "inspection budget" and "a stated priority choice". | `stage-3-review.ts:225-229`; `step-3-cookbook.md:569-570` | 899-902 |
| P10 | Open. Stage 3 collect reads only the `exports` and `types` of a Knip issue, not the unused `files`. A probe: a reported-unused file gets no target and no excerpt. | `stage-3-collect.ts:33-48, 237-243` | 879-881 |
| P11 | Open. Capture copies once and compares once, then stops on a change. Excluded paths are listed only for the files of the Git commit (GA-04). | `stage-1-commands.ts:206-216`; `stage-1-exclusions.ts:11-12`; `stage-1-git.ts:118-123` | 439-443 |
| P12 | Open. Stage 2 renames the discovery draft first. Stage 3 renames `run.yaml` first. Stage 1 writes `run.yaml` directly. Only Stage 4/5 and Stage 6 have a lock, each with its own name. Stage 6 also checks its own temporary files. A probe: after a stop between two renames, Stage 2 `start` accepts the state. | `stage-2-finish.ts:403-409`; `stage-3-finish.ts:395-417`; `stage-1-commands.ts:443-465`; `stage-4-5-publish.ts:140`; `stage-6-commands.ts:100, 238-239` | 491-494 |
| P13 | Open. The roots are fixed at Stage 4 start. Stage 5 must keep the Stage 4 graph and refuses a new source entry outside the roots. The documents say to start a new run. GA-07 and GA-08 make this more frequent, because they find candidates at Stage 4 collect, after the roots are fixed. | `stage-4-5-publish.ts:300-319`; `record-graph.ts:76-91`; `record-format.md:715-721` | 524, 1013-1015 |

### Scope after plan change 20

| Findings | Plan change 20 | Appendix B |
|---|---|---|
| P1, P2, P3, P4 | The Step 2 gate. Next, in a separate PR. | GB-01a, GB-01b, GB-02a, GB-02b, GB-03, GB-04a to GB-04d |
| P12 | Next. Stages 2 and 3 write the run manifest last and roll back, as Stages 4 to 6 do. | GB-12a, GB-12b |
| Stray attempt files | A probe with the Step 2 gate. The probe now shows the defect. | GB-14 |
| P7 (cited evidence and the template check), P8, P9, P10 | Decided after one real Step 1 run on Choom. | Drafts: GB-07a to GB-07f, GB-08a to GB-08c, GB-09a, GB-09b, GB-10 |
| P5, P6, P7 (the prompt-version field), P11, P13 | The design text changes, not the code (#101). | None. See "Not planned". |

The re-check also found these related defects:

- Under the viewer's rule, which plan change 20 keeps for P1, a file name with
  a dot, such as `cli.ts`, names the item `cli` when that item exists
  (`src/lib/discovery-placement.ts:33-40`, `record-baseline.ts:222-223`). See
  "Not covered by Appendix B".
- Stages 2 to 6 do not check that cited evidence was supplied to the LLM. The
  report named only Stages 2 and 3. Draft GB-07b.
- The Stage 2 cookbook cites `settings-002` in an example and says that newer
  settings IDs can exist, but the settings ID is always `settings-001`
  (`step-2-cookbook.md:121-122, 264`; `stage-1-commands.ts:124`). Draft GB-08a
  corrects it; any document change can correct it earlier.
- The Stage 4/5 publisher registers an attempt file that no phase wrote. GB-14.

### How to work every ticket (Appendix B)

Follow `AGENTS.md`, [New feature planning](../engineering-guidelines/new-feature-planning.md),
[Coding principles](../engineering-guidelines/coding-principles.md) and the
[Gherkin guide](../engineering-guidelines/gherkin-guide.md). Rule 5 of
Appendix A and its plan change 6 still apply: before a ticket changes the logic
of a `.mjs` or `.py` file, it converts that file to TypeScript in a separate
commit. For each ticket:

1. **Write the BDD acceptance test first.** Add the Gherkin scenarios of the
   ticket to the `.feature` file that the ticket names. Add a new feature file
   to the behavior list of the owning `component.yaml`. Write the steps in
   `test/steps/`. Run the scenarios through the public entry point: the
   producer command line or the viewer. They must fail for the reason that the
   ticket gives under "Fails today because". A scenario that passes before the
   change is a guard, and the ticket says so.
2. **Drop into TDD for the parts.** Each numbered step marked **U**, **I**,
   **N** or **A** is one red–green–refactor loop: write one focused test, see
   it fail because the behavior is missing, make it pass with the smallest
   change, then refactor while all tests pass. A step without a mark is a
   refactor that existing tests cover, or a document.
3. **Finish the scenario.** Run the acceptance test and its supporting tests
   together. Then run `bun run test`, `bun run lint`, `bun run check-types`,
   `bun run check:contracts` when a contract changes, and
   `bun run habit-hooks --all`.
4. **Change a characterization test on purpose.** Some tests record today's
   weak behavior, for example
   `packages/producer/test/integration/records/stage-6-records.test.ts:108-121`
   for P1 and P2. Change such a test in the same commit as the new failing
   test, and say so in the commit message.
5. **Refactor untested code under a passing test first.** Many stage helpers
   run their action when they are imported. Before a unit test of a function
   inside such a helper, move the function into a class in its own module,
   under the existing interface and integration tests.
6. **Update the documents in the same change.** `docs/design/app-a/record-format.md`,
   the stage cookbooks and `start-here.md` describe each record and check.
   Change the design text only where the decision log says so.
7. **Break a ticket that grows.** If a ticket needs more than one PR to stay
   reviewable, split it. Each part starts with its own failing scenario, or
   with characterization tests for a refactor.

**Test levels** (from the coding principles):

| Mark | Level | Meaning in this plan |
|---|---|---|
| U | Unit | One component's rules and edge cases. Every other Choom component is a mock, also in the same workspace. |
| I | Interface | A Choom-owned wrapper of an external library, program or API, such as ts-morph, picomatch, rsync, Git or ripgrep, tested through its public methods. |
| N | Integration | The real implementations of all participating components, such as a stage helper with the shared record checks and `@choom/baseline-model`. |
| A | Acceptance | A Gherkin scenario through the producer command line or the viewer. |

**Constraints.** The planning guide asks each ticket to record a decision for
behavior, observability, architecture and interface. Unless a ticket says
otherwise:

- **Behavior:** the feature file that the ticket names.
- **Observability:** out of scope. The producer is a manual command line, and
  `cookbook/observability/service.yaml` defines no indicator or objective. The
  signal that a feature works is the saved record and the refusal message of
  the action, which the acceptance scenarios check.
- **Architecture:** no dependency rule changes. New producer modules stay in
  `packages/producer/src`, which can import `@choom/baseline-model` and no app
  code (`.dependency-cruiser.cjs`).
- **Interface:** the ticket names each record that it adds or changes. DB13
  says where its TypeSpec model goes. `record-format.md` describes it.

**Runs that started before a ticket.** Every stage action, `verify` too,
refuses a producer whose code changed after the run started (GA-00e,
`producer-code.ts:106-113`). So a run always uses the producer version that
started it, and a new check never applies to an older run. No ticket migrates
old runs. A producer record keeps its `formatVersion` when only the producer
reads it (plan change 14). No ticket in this plan changes a record format that
the viewer reads.

**Shared files.** Tickets of the same order can start at the same time. When
two of them change the same file (see "Main files" in the ticket map), merge
one, then rebase the other. `fixtures/entry-points/producer.mjs` is still
JavaScript. The first ticket that changes more than a reference in it converts
it to TypeScript in a separate commit.

### Decision log

"Decided" means that plan change 20 (draft #101) decides it. The owner has not
approved the "Proposed" rows yet.

| # | Question | State | Decision | Tickets |
|---|---|---|---|---|
| DB1 | What can a subject reference name? (P1) | Decided, with two proposed details | A snapshot file or folder, the snapshot ID, a question or gap, an entry candidate, or a baseline item by the viewer's rule: the item ID, or the ID and a dot. A gap that Stage 1 copies from a tool record keeps its subjects. Proposed details: (a) a folder is written as a membership selector `dir/**` that matches at least one snapshot file; (b) a required gap of GB-04 keeps the subjects of its tool record too, as a Stage 1 tool gap does, so it can name a missing compiler input. | GB-01a, GB-01b, GB-04b |
| DB2 | Where are subjects checked? (P1) | Decided, with one proposed addition | The shared record checks of Stages 4 to 6 check every question and gap, so a change that orphans a frozen subject is refused at the stage that makes it. Proposed addition: Stages 1 to 3 also check the records that they add, so a subject that names nothing is refused before later stages freeze it. | GB-01a, GB-01b |
| DB3 | What supports an inspected path? (P2) | Proposed | Each step cites at least one reviewed range of the selected review history. Each component in `componentIds` owns a file or part that a reviewed range cited by the steps covers. A step can also cite other evidence, such as a graph or references record. | GB-02b |
| DB4 | What is a current summary? (P3) | Proposed | A summary that describes the selected records and the progress of the run. `coverage` has `inventoried`, `inspected`, `recorded` and `pending`. `recorded` replaces `unresolved`: it gives the record counts of the questions and gaps, with history and linked notes. `pending` lists the stages that have not completed. Choom does not decide which question or gap is answered, so there is no status field. A status needs discovery `formatVersion: 3` and a viewer change, which this plan does not include. The LLM review stays responsible for current overview prose. | GB-03 |
| DB5 | Which tool outcomes need a gap, and who writes it? (P4) | Proposed | The records of GB-04d: the Knip receipts (`skipped`, `failed`, and an `unsupported` preflight), the Stage 3 symbol mentions (`partial`, `unavailable`, `skipped`) and exports records (each gap that the record lists), and the Stage 4 candidate records (each gap that the record lists, and `status: partial`). Stage 1 keeps plan change 8 for its Git and settings records. The action that saves a tool record also saves the required gaps that it gives, with reserved IDs. The review prompt lists them. The review copies them exactly into the entry analysis and the discovery, because both lists must be the same and the response must hold the exact record text. The publishing action refuses a packet that leaves out or changes a required gap, or that uses a reserved ID for another gap. A dependency graph failure still stops the run: an "analysis unsupported" route for the graph (design 450-451) is not in this plan. | GB-04a to GB-04d |
| DB6 | Which fields does the run manifest get? (P5) | Dropped | Plan change 20: the run manifest and the records that it registers are the run record. The design text says so (#101). | — |
| DB7 | What is a prompt version? (P7) | Version field dropped; template check deferred | Plan change 20: the producer code digest and the cookbook copy that each stage start saves identify the prompt template, so there is no prompt-version field. The check that a saved prompt starts with the prompt that the helper wrote is decided after the first real run. | Drafts GB-07c to GB-07f |
| DB8 | How is an entry candidate traced? (P8) | Deferred | Revision 2 proposal: `package-field`: a cited manifest field whose value is the expression; the path is that value from the manifest folder. `script`: a cited package script whose text contains the expression and the path. `convention`: a cited Knip plugin pattern of the Stage 2 profile that is the expression and selects the path. `source`: a cited saved source range or search match whose text contains the expression. For every origin, the path is inside the workspace folder. Choom does not check `inference` and `unknown`. A candidate that these rules cannot trace uses `inference` or `unknown` (design 856). | Drafts GB-08a to GB-08c |
| DB9 | What is a deferral record? (P9, P10) | Deferred | Revision 2 proposal: a gap of `kind: deferred`, which the viewer already groups (CR-004), and one item in a new `deferrals` list of the entry analysis: `{id, gapRef, reasonKind, claim, searchRefs, reportRefs, limitRef}`. `reasonKind` is one of `computed-loading`, `missing-input`, `unsupported-source`, `outside-consumer`, `runtime-evidence` and `run-limit`. A priority choice is not a reason. Stages 3, 4 and 5 can add deferrals, and later stages keep them unchanged. A gap of `kind: suspected-unused` follows the same evidence rules. The gap shape and the viewer do not change. | Drafts GB-09a, GB-09b |
| DB10 | How does capture handle changes and exclusions? (P11) | Dropped | Plan change 20: capture stops on a change, the operator retries in a new folder, and the exclusions stay as rules. The design text says so (#101). | — |
| DB11 | What is one complete update? (P12) | Decided | Plan change 20: Stages 2 and 3 write the run manifest last and roll back, as Stages 4 to 6 do. The rest of the revision 2 proposal (one lock for every action, draft digests in `run.yaml`, a cleanup action) is not planned. | GB-12a, GB-12b |
| DB12 | How is affected work revisited before Stage 6? (P13) | Dropped | Plan change 20: after Stage 4 publication, a root or settings correction needs a new run. Stage 5 can still revise model statements. The design text says so (#101). | — |
| DB13 | Where are the contracts of new or changed producer records? (all) | Proposed | In a new `cookbook/interfaces/producer-run-records.tsp`, as CR-005 did in `producer-boundary-intake.tsp`. The ticket that first adds or changes a record adds its model; later tickets extend it. The models are generated into `packages/producer/src/generated/contracts.ts`, linked from `packages/producer/component.yaml`, and checked by `bun run check:contracts`. | All tickets that change a record |
| DB14 | Where do the new tests go? (all) | Proposed | The coding principles place tests beside the code as `*.test.ts`. The producer suites are in `packages/producer/test/`, and `test:native` and `test:integration` scan only those folders. Proposal: new tests extend the existing suites in `packages/producer/test/` and `test/steps/`. A move of the producer tests is a separate change. | All tickets |

### Ticket map and order

"Order" is the earliest round in which a ticket can start, from its "Needs".

**Next: the Step 2 gate and P12** (plan change 20)

| Order | Ticket | Finding | Needs | Main files |
|---|---|---|---|---|
| 1 | GB-01a Stages 4 to 6 refuse a subject that names nothing | P1 | DB1, DB2 | `baseline-model/src`, `src/lib/discovery-placement.ts`, new `record-subjects.ts`, `stage-6-records.ts` |
| 1 | GB-02a A source site cites its reviewed range | P2 | — | `stage-6-records.ts` |
| 1 | GB-04a Required gaps from Stage 2 Knip outcomes | P4 | DB5 | `stage-2-knip-run.ts`, `stage-2-finish.ts` |
| 1 | GB-12a Stage 3 writes the run manifest last and rolls back | P12 | DB11 | `stage-3-finish.ts` |
| 1 | GB-14 The publisher refuses a stray attempt file | stray files | — | `stage-4-5-publish.ts` |
| 2 | GB-01b Stages 1 to 3 refuse a subject that names nothing | P1 | GB-01a | `stage-1-commands.ts`, `stage-2-finish.ts`, `stage-3-review.ts` |
| 2 | GB-02b Inspected paths cite reviewed source | P2 | GB-02a, DB3 | `stage-6-records.ts` |
| 2 | GB-04b Required gaps from Stage 3 records | P4 | GB-04a | `stage-3-collect.ts`, `stage-3-review.ts` |
| 2 | GB-04c Required gaps from Stage 4 candidate records | P4 | GB-04a | `stage-4-commands.ts`, `stage-4-5-publish.ts` |
| 2 | GB-12b Stage 2 rolls back a failed publication | P12 | GB-12a | `stage-2-finish.ts` |
| 3 | GB-03 Current summaries in the run manifest | P3 | GB-12a, GB-12b, DB4 | every publisher |
| 3 | GB-04d Completion check: each tool result has its gap | P4 | GB-04b, GB-04c | `stage-6-records.ts` |

**Drafts: decided after the first real run** (plan change 20)

| Ticket | Finding | Needs |
|---|---|---|
| GB-07a One check for LLM call records | P7 | — |
| GB-07b Cited evidence was supplied | P7 | GB-07a |
| GB-07c The saved prompt starts with the helper's prompt, Stages 3 to 5 | P7 | GB-07a |
| GB-07d, GB-07e, GB-07f The same check for Stages 1, 2 and 6 | P7 | GB-07c |
| GB-08a Trace package-field and script candidates | P8 | DB8 |
| GB-08b, GB-08c Trace convention and source candidates | P8 | GB-08a |
| GB-09a Deferral records with checked evidence | P9 | GB-01b, GB-08a, DB9 |
| GB-09b Investigate reported-unused files before a deferral | P9, P10 | GB-09a, GB-10 |
| GB-10 Collect evidence for reported-unused files | P10 | — |

---

### Next tickets: the Step 2 gate and P12

### GB-01a Stages 4 to 6 refuse a subject that names nothing

**Finding:** P1. **Needs:** DB1, DB2.

**Constraints:** behavior `issue-subjects.feature`. Interface:
`record-format.md` "Discovery" gets the subject forms; the discovery contract
does not change. Observability and architecture: the defaults.

The viewer's rule "a subject names an item when it equals the item ID or
starts with the ID and a dot" has two copies: the viewer placement
(`src/lib/discovery-placement.ts:33-40`) and the producer check of unknown
values (`record-baseline.ts:222-223`). The P1 check is the third use, so the
coding principles ask for one shared class first.

New feature file `cookbook/behavior/producer/issue-subjects.feature`:

```gherkin
@producer
Feature: Questions and gaps name things that the run saved
  A subject names a snapshot file or folder, the snapshot ID, a question or gap,
  an entry candidate, or a baseline item. The shared record checks refuse a
  question or gap whose subject names nothing, also when a later change orphans
  an earlier subject.

  Scenario Outline: A Stage 4 or 5 draft with a gap whose subject names nothing is refused
    Given a <stage> draft with a new gap whose subject is "src/no-such-file.ts"
    When the operator publishes the <stage> draft
    Then the draft is refused
    And the operator is told that the subject "src/no-such-file.ts" of the gap names nothing

    Examples:
      | stage   |
      | Stage 4 |
      | Stage 5 |

  Scenario: A change that orphans an earlier subject is refused at the stage that makes it
    Given a Stage 4 run with a question about the interface "billing-api"
    And a Stage 5 draft that removes the interface "billing-api"
    When the operator publishes the Stage 5 draft
    Then the draft is refused
    And the operator is told which question names the removed interface

  Scenario Outline: Each form of subject is accepted
    Given a Stage 4 draft with a new question whose subject is <subject>
    When the operator publishes the Stage 4 draft
    Then the Stage 4 draft is published

    Examples:
      | subject                                                |
      | the ID of a component                                  |
      | the purpose statement of a component                   |
      | a snapshot file                                        |
      | the snapshot folder "src/**"                           |
      | the snapshot ID                                        |
      | the ID of an earlier gap                               |
      | the ID of an entry candidate                           |
```

**Fails today because** the shared record checks test only that `subjectRefs`
holds strings (`stage-6-records.ts:295-306`). The outline "Each form of subject
is accepted" is a guard: it passes today and must still pass. The orphan
scenario uses an interface, because Stage 5 must keep every component ID
(`stage-4-5-publish.ts:320-321`).

**Steps:**

1. Refactor first, under the placement tests of GA-11b2
   (`test/unit/lib/discovery-placement.test.ts`) and the tests of
   `record-baseline.ts`: move the viewer's rule into a `SubjectItems` class of
   `@choom/baseline-model`. The viewer placement and `validateBaseline` use it.
   Behavior does not change.
2. **U** `SubjectChecker` in a new `record-subjects.ts` takes the inventory,
   the snapshot ID, the question and gap IDs with their history, the entry
   candidate IDs and `SubjectItems` of the baseline. `refused(record)` returns
   each subject that matches no form of DB1.
3. **U** A `dir/**` subject must match at least one snapshot file (DB1, detail
   a). A folder written without `/**` is refused with a message that shows the
   selector form.
4. **U** A gap that Stage 1 copied from a tool record keeps its subjects
   (plan change 20).
5. **N** The shared record checks of Stages 4 to 6 run `SubjectChecker` on
   every question and gap. Correct the test data that names nothing, such as
   `support/stage-6-records.ts:103` (`plugin-candidate`) and the subjects
   `subject-0` to `subject-99` of `interface/stage-6/refusals.test.ts:54-62`.
   Change the characterization test
   `integration/records/stage-6-records.test.ts:108-112`. Keep the contract
   check first, so the limit messages stay the same.
6. Document the subject forms in `record-format.md` "Discovery", the stage
   cookbooks and `stage-4-review-prompt.ts`.

### GB-01b Stages 1 to 3 refuse a subject that names nothing

**Finding:** P1. **Needs:** GB-01a. This ticket is the proposed addition of
DB2.

**Constraints:** behavior `issue-subjects.feature`. Interface: no record
changes. Observability and architecture: the defaults.

Add to `issue-subjects.feature`:

```gherkin
  Scenario Outline: An early stage refuses a gap whose subject names nothing
    Given a <stage> review with a new gap whose subject is "src/no-such-file.ts"
    When the operator finishes <stage>
    Then the <stage> result is not published
    And the operator is told that the subject "src/no-such-file.ts" of the gap names nothing

    Examples:
      | stage   |
      | Stage 1 |
      | Stage 2 |
      | Stage 3 |

  Scenario: An inspection priority names something
    Given a Stage 3 review whose inspection priority names "nothing-here"
    When the operator finishes Stage 3
    Then the Stage 3 result is not published
    And the operator is told which inspection priority names nothing
```

**Fails today because** Stages 1 to 3 check only that `subjectRefs` holds
strings (`stage-1-commands.ts:383`, `stage-2-finish.ts:207`,
`stage-3-review.ts:228`). Without this ticket, such a record is frozen first
and refused only at Stage 4, and the run must start again.

**Steps:**

1. **N** Stage 1 `finish` checks the questions and gaps of the review with
   `SubjectChecker`.
2. **N** Stage 2 `plan` and `finish` check the records that they add.
3. **N** The Stage 3 finalizer checks its new records and the subjects of new
   inspection priorities. CR-005 clues keep their own check.

### GB-02a A source site cites its reviewed range

**Finding:** P2. **Needs:** nothing.

**Constraints:** behavior `reviewed-evidence.feature`. Interface:
`record-format.md` "Entry analysis"; no record changes. Observability and
architecture: the defaults.

New feature file `cookbook/behavior/producer/reviewed-evidence.feature`:

```gherkin
@producer
Feature: Explanations cite the source that a review read
  A requested excerpt is not a reviewed range. A behavior entry, a resource
  access site and an inspected path cite reviewed ranges of the selected history.

  Scenario: A behavior entry that cites an excerpt that no review read is refused
    Given a Stage 4 draft whose behavior entry cites a requested excerpt of its lines that no reviewed range names
    When the operator publishes the Stage 4 draft
    Then the draft is refused
    And the operator is told which behavior entry does not cite a reviewed range
```

**Fails today because** the site check accepts any cited record that has the
same path and lines (`stage-6-records.ts:382`). A probe confirmed it. No Stage 4
fixture has a behavior entry yet, and a reviewed range takes the ID of its
excerpt, so the Given needs an `excerpt` request that no `reviewedFiles` item
names.

**Steps:**

1. **N** In `sourceSiteCheck`, a cited reference supports the site only when
   its ID names a reviewed range of the selected history (`selectedHistory`,
   `stage-6-records.ts:308`) that contains the site.
2. **N** Resource access observations use the same check. Add a refused case
   for them to `integration/records/stage-6-records.test.ts`.
3. Say in `record-format.md` "Entry analysis" that a behavior entry cites the
   reviewed range itself.

### GB-02b Inspected paths cite reviewed source

**Finding:** P2. **Needs:** GB-02a, DB3.

**Constraints:** behavior `reviewed-evidence.feature`. Interface:
`record-format.md` "Discovery"; no record changes. Observability and
architecture: the defaults.

Add to `reviewed-evidence.feature`:

```gherkin
  Scenario: An inspected path step that cites only unread evidence is refused
    Given a Stage 4 draft with an inspected path whose second step cites only an excerpt that no reviewed range names
    When the operator publishes the Stage 4 draft
    Then the draft is refused
    And the operator is told which step of the inspected path has no reviewed source

  Scenario: An inspected path names only components that its review covers
    Given a Stage 4 draft with an inspected path that names a component whose files no cited reviewed range covers
    When the operator publishes the Stage 4 draft
    Then the draft is refused
    And the operator is told which component of the inspected path has no reviewed source

  Scenario: An inspected path with reviewed steps is published
    Given a Stage 4 draft with an inspected path whose steps each cite a reviewed range
    When the operator publishes the Stage 4 draft
    Then the Stage 4 draft is published
```

**Fails today because** only the site of the entry must be in a reviewed range
(`stage-6-records.ts:400-411`). The third scenario is a guard. No fixture has
an inspected path today; use the `changeRecords` hook of
`fixtures/stage-4-publication/fixture.ts` to add one.

**Steps:**

1. **N** Each step cites at least one reviewed range of the selected history.
2. **N** Each component in `componentIds` owns, by the selected mapping, a file
   or part that a reviewed range cited by the steps covers.
3. **N** Stage 6 and `verify` use the same validator. Add the refused cases to
   `integration/records/stage-6-records.test.ts`, and change the
   characterization test at `:114-121`.
4. Change `record-format.md` "Discovery" and the Stage 4 and 5 review prompts.

### GB-03 Current summaries in the run manifest

**Finding:** P3. **Needs:** GB-12a, GB-12b, DB4.

**Constraints:** behavior `run-manifest.feature`. Interface: `run.yaml`
`coverage` changes (DB4); add the run manifest model (DB13) and a "Run
manifest" section to `record-format.md`. Observability and architecture: the
defaults.

New feature file `cookbook/behavior/producer/run-manifest.feature`:

```gherkin
@producer
Feature: The run manifest describes the selected records
  Each publisher refreshes the summary of the run. The summary names the
  selected records and the stages that are still pending. It counts recorded
  questions and gaps, and does not call them unresolved.

  Scenario: After Stage 4 the summary describes the Stage 4 records
    Given a Stage 4 draft
    When the operator publishes the Stage 4 draft
    Then the run summary names the Stage 4 entry analysis for the reviewed source ranges
    And it says that Stages 5 and 6 are pending
    And it does not say that the baseline is not yet recovered

  Scenario: The completed run counts recorded questions and gaps
    Given a reviewed Stage 5 draft with one question, one gap and a later gap that names the first gap
    When the operator saves the result
    Then the run summary says that the discovery result records 1 question and 2 gaps, with history and linked notes
    And it does not call them unresolved
```

**Fails today because** the publishers after Stage 1 keep the coverage text of
Stage 1, and Stage 6 writes the list lengths under `coverage.unresolved`.

**Steps:**

1. **U** `RunSummary` makes `coverage` from the progress of the run and the
   selected records: `inventoried` (the file count), `inspected` (the selected
   entry analysis for the reviewed ranges, and the selected code mapping when
   there is one), `recorded` (the record counts of the questions and gaps, with
   history and linked notes) and `pending` (the stages that have not
   completed).
2. **U** No text that it makes calls a count unresolved or says that a
   completed stage is pending.
3. **N** Stage 1 `finish` writes the summary.
4. **N** Stage 2 `finish` and the Stage 3 finalizer write it.
5. **N** The Stage 4/5 publisher writes it, and its `verify` makes it again
   and refuses a difference.
6. **N** Stage 6 writes it, and its `verify` makes it again.
7. Change `interface/stage-6/outputs.test.ts:110-125` on purpose. Add
   `coverage` to the fixtures that write `run.yaml`: `support/staged-run.ts`,
   `fixtures/stage-4-publication/fixture.ts`,
   `fixtures/boundary-publication/fixture.ts` and
   `fixtures/entry-points/producer.mjs`.
8. Change `step-6-cookbook.md` where it accepts stale interim text in the
   manifest.

### GB-04a Required gaps from Stage 2 Knip outcomes

**Finding:** P4. **Needs:** DB5.

**Constraints:** behavior `tool-gaps.feature`. Interface: a required-gaps
record of the Knip run (DB13), and `record-format.md` gets a section for the
Knip receipts. Observability and architecture: the defaults.

New feature file `cookbook/behavior/producer/tool-gaps.feature`:

```gherkin
@producer
Feature: Unavailable analysis is a visible gap
  Each tool result that is unavailable, unsupported, skipped, failed or partial
  gives a gap that cites it. The review copies that gap exactly. A stage refuses
  a review that leaves it out.

  Scenario: A skipped Knip run gives a gap that the review must copy
    Given a Stage 2 attempt in which Knip is skipped because the snapshot has no package manifest
    When the operator runs Knip for the attempt
    Then the attempt lists one required gap for each skipped Knip run
    And each required gap cites its Knip run record and gives the reason of the skip

  Scenario: Stage 2 refuses a review that leaves out a required gap
    Given a Stage 2 attempt with a required gap for a skipped Knip run
    And a Stage 2 review that leaves out that gap
    When the operator finishes Stage 2
    Then the Stage 2 result is not published
    And the operator is told which required tool gap is missing
```

**Fails today because** the Knip run saves no required gap, and Stage 2
`finish` accepts a skipped or failed run with no gap
(`stage-2-finish.ts:263-293`). The Stage 2 support needs no Docker, because
Knip is skipped when there is no manifest.

**Steps:**

1. Refactor first, under `unit/stage-1-gaps.test.ts` and
   `interface/stage-1/tool-gaps.test.ts`: move `toolGaps` from
   `stage-1-gaps.ts` into a `ToolGaps` class in `tool-gaps.ts`, with the ID
   prefix as an input. Stage 1 keeps `s1-`. Knip is the third user after Git
   and settings.
2. **U** `ToolGaps.fromKnipRuns(receipts, receiptsRef)` gives one gap for each
   run whose status is `skipped` or `failed`, and one for an `unsupported`
   preflight. A gap has the ID `<attempt>-knip-gap-NNN`, `kind: tool-outcome`,
   the snapshot ID as its subject, the reasons of the record, and the pointer
   `<attempt>-knip-runs#/runs/N` as its evidence.
3. **N** The Stage 2 `run` action saves `required-gaps.json` with these gaps.
   The Stage 2 review prompt lists them.
4. **N** Stage 2 `finish` refuses a packet that leaves out or changes a required
   gap, or that uses a reserved ID for another gap.
5. Change `support/stage-2-attempt.ts:83-88` so that the review copies the
   required gap instead of its own `tool-outcome` gap.
6. Change `step-2-cookbook.md`.

### GB-04b Required gaps from Stage 3 records

**Finding:** P4. **Needs:** GB-04a.

**Constraints:** behavior `tool-gaps.feature`. Interface: the required-gaps
record of Stage 3 (DB13). Observability and architecture: the defaults.

Add to `tool-gaps.feature`:

```gherkin
  Scenario Outline: Stage 3 refuses a review that leaves out the gap of a tool result
    Given a Stage 3 attempt whose <record> is <outcome>
    And a Stage 3 review that leaves out the required gap of the <record>
    When the operator finishes Stage 3
    Then the Stage 3 result is not published
    And the operator is told which required tool gap is missing

    Examples:
      | record          | outcome                                     |
      | symbol mentions | partial                                     |
      | symbol mentions | unavailable                                 |
      | exports record  | missing a declaration file that it names    |
```

**Fails today because** the Stage 3 finalizer accepts these outcomes with no
gap (`stage-3-finish.ts:267`).

**Steps:**

1. **U** `ToolGaps.fromSymbolMentions(record, ref)` gives a gap for the status
   `partial`, `unavailable` or `skipped`.
2. **U** The gaps of an exports record (`snapshot-project.ts`) become required
   gaps through `ToolGaps`. They keep the subjects of the tool record (DB1,
   detail b).
3. **N** Stage 3 `collect` and the `exports` action save their required gaps.
   The review prompt lists them.
4. **N** The Stage 3 finalizer refuses a packet that leaves out or changes a
   required gap.
5. Change `step-3-cookbook.md`.

### GB-04c Required gaps from Stage 4 candidate records

**Finding:** P4. **Needs:** GB-04a.

**Constraints:** behavior `tool-gaps.feature`. Interface: the required-gaps
record of Stage 4 (DB13). Observability and architecture: the defaults.

Add to `tool-gaps.feature`:

```gherkin
  Scenario: Stage 4 refuses a review that leaves out the gap of a candidate record
    Given a Stage 4 collection whose behavior entry candidates record a settings value that is not a literal
    And a Stage 4 review that leaves out the required gap of that value
    When the operator publishes the Stage 4 draft
    Then the draft is refused
    And the operator is told which required tool gap is missing
```

**Fails today because** the gaps of `behavior-entry-candidates.json` and
`resource-access-candidates.json`, and a candidate record with
`status: partial`, stay in their records (`record-behavior-candidates.ts:67-75`).

**Steps:**

1. **U** The gaps of both candidate records, and a `partial` status, become
   required gaps through `ToolGaps`.
2. **N** Stage 4 `collect` saves them, and the Stage 4 review prompt lists them.
3. **N** The Stage 4/5 publisher refuses a packet that leaves out or changes a
   required gap. Stage 5 keeps the Stage 4 gaps, as it keeps other earlier
   records.
4. Change `step-4-cookbook.md` and `record-format.md` "Behavior entry candidates".

### GB-04d Completion check: each tool result has its gap

**Finding:** P4. **Needs:** GB-04b, GB-04c.

**Constraints:** behavior `tool-gaps.feature`. Interface: no record changes.
Observability and architecture: the defaults.

Add to `tool-gaps.feature`:

```gherkin
  Scenario: Stage 6 refuses a selected tool result without its gap
    Given a reviewed Stage 5 draft whose selected history has a skipped Knip run and no gap that cites it
    When the operator saves the result
    Then nothing is saved
    And the operator is told which tool result has no gap
```

**Fails today because** Stage 6 checks only the digests of the Knip receipts
(`stage-6-records.ts:332`). After GB-04a to GB-04c, each stage refuses a review
without the gap. The invariant still belongs in the shared validator, which
every Stage 4, 5 and 6 action passes.

**Steps:**

1. **N** The shared validator lists the tool results of the selected history:
   the Stage 1 Git and settings records (each gap that the record lists), the
   Knip receipts, the Stage 3 symbol mentions and exports records, and the
   Stage 4 candidate records.
2. **N** Each result with an outcome of DB5 has a gap whose evidence cites it.
3. Add a refused case to `integration/records/stage-6-records.test.ts`.

### GB-12a Stage 3 writes the run manifest last and rolls back

**Finding:** P12. **Needs:** DB11.

**Constraints:** behavior `draft-publication.feature`. Interface: no record
changes. Observability and architecture: the defaults.

New feature file `cookbook/behavior/producer/draft-publication.feature`:

```gherkin
@producer
Feature: Publish the drafts of a run as one update
  A stage replaces the working drafts as one update. It replaces the run
  manifest last. If a step fails, the stage restores the drafts that it had
  replaced, so the last published drafts stay.

  Scenario: A failed Stage 3 publication keeps the last published drafts
    Given a run that is ready for Stage 3 to publish
    And a fault that stops the publication after its first rename
    When the operator finishes Stage 3
    Then the Stage 3 result is not published
    And the run manifest and the discovery draft are the same as before
```

**Fails today because** Stage 3 replaces `run.yaml` first and has no rollback
(`stage-3-finish.ts:395-417`). It only prints that the operator must restore
the drafts.

**Steps:**

1. **U** Extend the fault double `support/doubles/stage-6-faults.ts`, so a test
   can stop the Stage 3 publication after a chosen rename. It needs no Docker.
2. **N** The Stage 3 finalizer replaces the discovery draft first and
   `run.yaml` last.
3. **N** If a step fails, it restores each replaced draft from its saved
   checkpoint, as the Stage 4/5 publisher does (`stage-4-5-publish.ts:417-419`).
4. Change `step-3-cookbook.md`, which says today that `run.yaml` is renamed
   first.

### GB-12b Stage 2 rolls back a failed publication

**Finding:** P12. **Needs:** GB-12a.

**Constraints:** behavior `draft-publication.feature`. Interface: no record
changes. Observability and architecture: the defaults.

Add to `draft-publication.feature`:

```gherkin
  Scenario: A failed Stage 2 publication keeps the last published drafts
    Given a run that is ready for Stage 2 to publish
    And a fault that stops the publication after its first rename
    When the operator finishes Stage 2
    Then the Stage 2 result is not published
    And the run manifest and the discovery draft are the same as before
```

**Fails today because** Stage 2 replaces the discovery draft and then
`run.yaml`, with no rollback (`stage-2-finish.ts:403-409`).

**Steps:**

1. **U** The fault double can stop the Stage 2 publication after a chosen
   rename.
2. **N** If the second rename fails, Stage 2 `finish` restores the discovery
   draft from its `discovery.before.yaml` checkpoint. Today it only prints that
   the operator must restore it (`stage-2-finish.ts:419`).
3. Change `step-2-cookbook.md`.

### GB-14 The publisher refuses a stray attempt file

**Finding:** the stray-file suspicion of "Open after the final review". It is
not a P finding. Plan change 20 puts it with the Step 2 gate. **Needs:**
nothing.

**Constraints:** behavior `draft-publication.feature`. Interface: no record
changes. Observability and architecture: the defaults.

Add to `draft-publication.feature`:

```gherkin
  Scenario: An attempt file that no phase wrote is refused
    Given a Stage 4 attempt folder with a file that no phase wrote
    When the operator publishes the Stage 4 draft
    Then the draft is refused
    And the operator is told which attempt file no phase wrote
```

**Fails today because** the publisher registers every file of the attempt
folder (`stage-4-5-publish.ts:186-191, 286-291`). `checkPhases` checks only the
files that the receipts name. A probe confirmed it: the stray file was
registered, and `check`, `finish` and `verify` passed.

**Steps:**

1. **U** The attempt files are the outputs that the phase receipts name, the
   phase receipts, and the files of the review packet. Any other file is
   refused with its name.
2. **N** The Stage 4/5 publisher and its `verify` use this check.
3. **N** Run the same probe on the Stage 2, Stage 3 and Stage 6 publishers. If
   one registers a stray file, add the check there with its own failing test.
4. Change `record-format.md` "Check, publish and verify".

---

### Draft tickets: decided after the first real run

Plan change 20 decides P7 (the two checks), P8, P9 and P10 after one real Step 1
run on Choom. These tickets are revision 2 drafts for that decision. The run
journal of `docs/design/app-a/first-real-run.md` (in #101) can change them.

### GB-07a One check for LLM call records

**Draft. Plan change 20 decides it after the first real run.**

**Finding:** P7. **Type:** refactor. Behavior does not change.

Six places check a call record (see the re-check table). GB-07b and GB-07c
change all of them, so they become one class first.

**Constraints:** behavior: no new scenario; the characterization tests are the
acceptance check. Interface: no record changes. Observability and
architecture: the defaults.

**Characterization:** these tests pass before and after:
`unit/llm-response.test.ts`, `interface/stage-1/review-checks.test.ts`,
`interface/stage-2/plan-checks.test.ts`, `interface/stage-3/finish-checks.test.ts`,
`interface/stage-4/publication.test.ts` and `interface/stage-6/refusals.test.ts`.

**Steps:**

1. **N** Add characterization tests for each copy where its accepted values
   and messages are not tested yet. Include each difference between the copies.
2. Move the copies into one `LlmCallCheck` class in `llm-response.ts`. Keep
   each difference as a named option. If a difference is a defect, record it
   for a later ticket and do not change it here.

### GB-07b Cited evidence was supplied

**Draft. Plan change 20 decides it after the first real run.**

**Finding:** P7. **Needs:** GB-07a.

**Constraints:** behavior `llm-audit.feature`. Interface: `record-format.md`
(`llm/review-scope.json`); no record changes. Observability and architecture:
the defaults.

New feature file `cookbook/behavior/producer/llm-audit.feature`:

```gherkin
@producer
Feature: The LLM audit record shows what the LLM was given
  An LLM review cites only evidence that its review scope lists as supplied, or
  files of its own packet. The saved prompt starts with the prompt that the
  helper wrote.

  Scenario Outline: A review that cites evidence it was not given is refused
    Given a <stage> review whose new record cites a saved artifact that its review scope does not list as supplied
    When the operator <publishes>
    Then the <stage> result is not published
    And the operator is told which cited artifact was not supplied

    Examples:
      | stage   | publishes                   |
      | Stage 2 | finishes Stage 2            |
      | Stage 3 | finishes Stage 3            |
      | Stage 4 | publishes the Stage 4 draft |
      | Stage 5 | publishes the Stage 5 draft |
      | Stage 6 | saves the result            |
```

**Fails today because** only Stage 1 compares the cited evidence with the
supplied evidence (`stage-1-commands.ts:413-437`). The other stages only
resolve the supplied references.

**Steps:**

1. **U** `SuppliedEvidence` takes the rule of `checkSuppliedScope`: each
   evidence reference of a record that this review adds names a supplied
   artifact, a source record whose excerpt artifact is supplied, or a file of
   the current packet (`record-format.md:73-74`). A reviewed range comes from
   a supplied excerpt.
2. **U** Records that earlier stages preserved are not checked again. Their
   evidence was supplied to an earlier call.
3. **N** Stage 2 `plan` and `save-review` use it.
4. **N** The Stage 3 finalizer and the Stage 4/5 publisher use it.
5. **N** The Stage 6 readiness check uses it, and Stage 1 moves to it.
6. Correct the test data that cites evidence that it did not supply:
   `support/stage-2-attempt.ts`, `support/stage-3-attempt.ts:59-60`,
   `fixtures/stage-4-publication/fixture.ts`,
   `fixtures/stage-5-publication/fixture.ts` and
   `fixtures/entry-points/producer.mjs`.
7. Change `record-format.md` and the cookbooks.

### GB-07c The saved prompt starts with the helper's prompt, Stages 3 to 5

**Draft. Plan change 20 decides it after the first real run.**

**Finding:** P7. **Needs:** GB-07a, DB7.

**Constraints:** behavior `llm-audit.feature`. Interface: no record changes;
plan change 20 drops the prompt-version field. Observability and
architecture: the defaults.

Add to `llm-audit.feature`:

```gherkin
  Scenario Outline: A saved prompt that does not start with the helper's prompt is refused
    Given a <stage> review whose <difference>
    When the operator <publishes>
    Then the <stage> result is not published
    And the operator is told that the saved prompt differs from the prompt that the helper wrote

    Examples:
      | stage   | difference                                                        | publishes                   |
      | Stage 3 | saved prompt does not start with the prompt that the helper wrote | finishes Stage 3            |
      | Stage 4 | saved prompt does not start with the prompt that the helper wrote | publishes the Stage 4 draft |
      | Stage 5 | saved prompt does not start with the prompt that the helper wrote | publishes the Stage 5 draft |
```

**Fails today because** the saved prompt is checked only for text.

**Steps:**

1. **N** Stage 3 and 5 `collect` and Stage 4 `inspect` save the prompt that
   they write, as they do today (`review-prompt.md`).
2. **U** The publishing action requires `llm/analysis-prompt.md` to start with
   the bytes of that prompt. Follow-up directions after those bytes are
   allowed.
3. **N** The Stage 3 finalizer and the Stage 4/5 publisher use the check.
4. Change `record-format.md` and the cookbooks. The producer code digest and
   the saved cookbook copy identify the template (plan change 20), so no new
   field is needed.

### GB-07d Prompt template for Stage 1

**Draft. Plan change 20 decides it after the first real run.**

**Finding:** P7. **Needs:** GB-07c.

**Constraints:** behavior `llm-audit.feature`. Interface: as GB-07c.
Observability and architecture: the defaults.

Add a row to the Scenario Outline of GB-07c:

```gherkin
      | Stage 1 | saved prompt does not start with the prompt that the helper wrote | finishes Stage 1 |
```

**Fails today because** the Stage 1 prompt is free text in `step-1-cookbook.md`.

**Steps:**

1. Move the prompt into a template module with marked inputs.
2. **N** Stage 1 writes the prompt from the template and saves the prompt that
   it wrote.
3. **N** Stage 1 `finish` checks the saved prompt with the GB-07c check.
4. `step-1-cookbook.md` keeps only the commands and review steps (D3).

### GB-07e Prompt templates for Stage 2

**Draft. Plan change 20 decides it after the first real run.**

**Finding:** P7. **Needs:** GB-07c.

**Constraints:** behavior `llm-audit.feature`. Interface: as GB-07c.
Observability and architecture: the defaults.

Add rows to the Scenario Outline of GB-07c:

```gherkin
      | Stage 2 | saved plan prompt does not start with the prompt that the helper wrote     | finishes Stage 2 |
      | Stage 2 | saved analysis prompt does not start with the prompt that the helper wrote | finishes Stage 2 |
```

**Fails today because** both Stage 2 prompts, for the plan and for the
analysis, are free text in `step-2-cookbook.md`.

**Steps:**

1. Move both prompts into template modules with marked inputs.
2. **N** Stage 2 `start` writes the plan prompt, and `prepare` writes the
   analysis prompt. Each saves the prompt that it wrote.
3. **N** Stage 2 `plan`, `save-review` and `finish` check the saved prompts.
4. `step-2-cookbook.md` keeps only the commands and review steps.

### GB-07f Prompt template for Stage 6

**Draft. Plan change 20 decides it after the first real run.**

**Finding:** P7. **Needs:** GB-07c.

**Constraints:** behavior `llm-audit.feature`. Interface: as GB-07c.
Observability and architecture: the defaults.

Add a row to the Scenario Outline of GB-07c:

```gherkin
      | Stage 6 | saved readiness prompt does not start with the prompt that the helper wrote | saves the result |
```

**Fails today because** the Stage 6 readiness prompt is free text in
`step-6-cookbook.md`.

**Steps:**

1. Move the prompt into a template module with marked inputs.
2. **N** Stage 6 writes the prompt from the template and saves the prompt that
   it wrote.
3. **N** The Stage 6 readiness check refuses a saved prompt that differs.
4. `step-6-cookbook.md` keeps only the commands and review steps.

### GB-08a Trace package-field and script candidates

**Draft. Plan change 20 decides it after the first real run.**

**Finding:** P8. **Needs:** DB8.

**Constraints:** behavior `entry-candidates.feature`. Interface:
`record-format.md` "Entry analysis"; no record changes. Observability and
architecture: the defaults.

New feature file `cookbook/behavior/producer/entry-candidates.feature`:

```gherkin
@producer
Feature: Trace entry candidates to saved data
  An entry candidate cites the saved data that supports it. Choom checks that
  the cited data contains the expression and the path of the candidate.

  Background:
    Given a snapshot whose package manifest has the field "bin" with the value "./src/cli.ts" and the script "start" with the text "node src/server.js"

  Scenario: A package field candidate that its manifest supports is accepted
    Given a Stage 2 entry plan with the candidate "src/cli.ts" that cites the field "bin"
    When the operator saves the Stage 2 entry plan
    Then the entry plan is saved

  Scenario Outline: A candidate that its cited data does not support is refused
    Given a Stage 2 entry plan with a <origin> candidate that cites <cited> and has <claim>
    When the operator saves the Stage 2 entry plan
    Then the entry plan is not saved
    And the operator is told which candidate its cited data does not support

    Examples:
      | origin        | cited              | claim                                   |
      | package-field | the field "bin"    | the expression "./src/app.ts"           |
      | package-field | the field "bin"    | the path "src/app.ts"                   |
      | package-field | the package name   | the path "src/cli.ts"                   |
      | script        | the script "start" | the expression "node src/worker.js"     |
      | script        | the script "start" | the path "src/cli.ts"                   |
      | package-field | the field "bin"    | a workspace that does not hold its path |
```

**Fails today because** the Stage 2 plan check resolves the evidence and does
not read its value (`stage-2-commands.ts:169`, `record-checks.ts:76`). The
first scenario is a guard: it passes today and must still pass.

**Steps:**

1. **U** A new `CandidateTrace` class in `record-entry-trace.ts`. For
   `package-field`, a cited `settings-001#/packages/K/data/<field>` value, or
   one of its string leaves, equals the expression, and the path is that value
   from the manifest folder. For `script`, a cited `.../data/scripts/<name>`
   text contains the expression, and the path is a token of the script from the
   manifest folder.
2. **U** For every origin, the path is inside the folder of the workspace.
3. **U** A link from a `dist/` value to a `src/` path needs compiler-output
   evidence, as GA-07d does (`behavior-entry-bins.ts`). Without it the candidate
   must use `inference` or `unknown`.
4. **N** Stage 2 `plan` and `finish` use it.
5. **N** The Stage 3 finalizer (new candidates only) and the Stage 4/5
   publisher (added candidates only) use it.
6. Correct the test candidates: `support/stage-2-attempt.ts` cites
   `settings-001#/packages/0/data/main`; also the plan of
   `support/stage-3-attempt.ts` and `added()` in
   `interface/stage-4/publication.test.ts`.
7. Change `step-2-cookbook.md:121-122, 264` and `record-format.md` "Entry
   analysis".

### GB-08b Trace convention candidates

**Draft. Plan change 20 decides it after the first real run.**

**Finding:** P8. **Needs:** GB-08a.

**Constraints:** behavior `entry-candidates.feature`. Interface: no record
changes. Observability and architecture: the defaults.

Add to `entry-candidates.feature`:

```gherkin
  Scenario Outline: A convention candidate cites the plugin pattern that selects it
    Given a Stage 2 attempt for a package with a "gatsby" dependency, whose profile copies the pattern "src/pages/**/*.{js,jsx,ts,tsx}"
    And a Stage 2 entry analysis with the convention candidate <path> that cites that pattern
    When the operator finishes Stage 2
    Then <result>

    Examples:
      | path                 | result                                                                 |
      | "src/pages/home.tsx" | the Stage 2 drafts are published                                       |
      | "src/other/home.tsx" | the operator is told which candidate its cited pattern does not select |
```

**Fails today because** no check reads the cited pattern. The first row is a
guard. The pattern is a default entry pattern of the Knip 6.44.1 gatsby plugin.
Only the entry analysis can cite it, because `prepare` writes the preflight
after `plan`.

**Steps:**

1. **I** A wrapper of picomatch, loaded from the tool checkout, tells whether a
   pattern selects a path. The GA-08 matcher (`stage-4-plugin-entries.ts`) uses
   the same wrapper.
2. **U** For `convention`, the cited `<s2>-preflight#/pluginEntryPatterns/N`
   pattern equals the expression, and the wrapper selects the path.
3. **N** Stage 2 `finish`, the Stage 3 finalizer and the Stage 4/5 publisher use
   it.
4. Change `step-2-cookbook.md`.

### GB-08c Trace source candidates

**Draft. Plan change 20 decides it after the first real run.**

**Finding:** P8. **Needs:** GB-08a.

**Constraints:** behavior `entry-candidates.feature`. Interface: no record
changes. Observability and architecture: the defaults.

Add to `entry-candidates.feature`:

```gherkin
  Scenario Outline: A source candidate cites saved text that contains its expression
    Given a Stage 3 review with a source candidate whose expression is "new Worker('./jobs/run.js')"
    And the candidate cites <evidence>
    When the operator finishes Stage 3
    Then <result>

    Examples:
      | evidence                                      | result                                                                 |
      | a reviewed range that contains the expression | the Stage 3 drafts are published                                       |
      | a reviewed range of another function          | the operator is told which candidate its cited source does not support |
```

**Fails today because** the Stage 3 check resolves the evidence and does not
read its text (`stage-3-review.ts:239-268`). The first row is a guard.

**Steps:**

1. **U** For `source`, one cited record contains the expression in its saved
   text: a source record or excerpt range, `text-search-NNN.json#/matches/K`,
   `loading-search.json#/matches/K`, or
   `behavior-entry-candidates.json#/candidates/K`.
2. **U** The path is the file of that record, or a relative literal in the
   text, resolved from that file.
3. **N** The Stage 3 finalizer and the Stage 4/5 publisher use it.
4. Change `step-3-cookbook.md`.

### GB-09a Deferral records with checked evidence

**Draft. Plan change 20 decides it after the first real run.**

**Finding:** P9. **Needs:** GB-01b, GB-08a, DB9.

**Constraints:** behavior `deferrals.feature`. Interface: the entry analysis
gets `deferrals` (DB9, DB13). Observability and architecture: the defaults.

New feature file `cookbook/behavior/producer/deferrals.feature`:

```gherkin
@producer
Feature: Defer code only with checked evidence
  A deferral names its reason, the claim that stays unresolved, and the searches
  that checked it. A run limit is a reason only when the limit applied.

  Scenario: A deferral with a checked search is published
    Given a Stage 3 review that defers "src/legacy/**" because a computed name may load it
    And the deferral cites a completed snapshot search for "legacy" and the loading match that computes the name
    When the operator finishes Stage 3
    Then the Stage 3 drafts are published
    And the entry analysis records the reason, the claim and the search of the deferral

  Scenario: A deferral without a checked search is refused
    Given a Stage 3 review that defers "src/legacy/**" with only a reason text
    When the operator finishes Stage 3
    Then the Stage 3 result is not published
    And the operator is told that the deferral needs a completed search that names its subject

  Scenario: A run limit must have applied
    Given a Stage 3 review that defers "src/legacy/**" because of a run limit
    And no search or excerpt of "src/legacy/**" reached a limit
    When the operator finishes Stage 3
    Then the Stage 3 result is not published
    And the operator is told that the named run limit did not apply to "src/legacy/**"
```

**Fails today because** a deferral is a gap with free text. The finalizer
checks the search receipts, but nothing links a gap to a search
(`stage-3-review.ts:225-229`).

**Steps:**

1. **U** `DeferralChecks` in a new `record-deferrals.ts`: each new gap of
   `kind: deferred` has exactly one deferral with the same subjects, and each
   deferral names such a gap.
2. **U** `reasonKind` is one value of DB9, and `claim` has text.
3. **U** `searchRefs` holds at least one completed search with a receipt whose
   query or path names a subject (its path, folder, file stem or symbol). A
   `truncated` search alone supports only `run-limit`. The record limits say
   that this name test is text, not proof.
4. **U** `run-limit` needs `limitRef` to name a limit that applied to a subject:
   a truncated search or mention target, `filesAtMatchLimit`, or an excerpt that
   was skipped because of its size or encoding.
5. **U** Where it is mechanical, a reason needs a matching reference:
   `computed-loading` a computed loading match, `outside-consumer` a package
   field that `CandidateTrace` can trace, `missing-input` the exclusions or a
   missing compiler input gap.
6. **N** The Stage 3 finalizer checks the deferrals of Stage 3. Add `deferrals`
   to its exact field list.
7. **N** The Stage 4/5 publisher and the shared validator check the deferrals
   that Stages 4 and 5 add, keep earlier deferrals unchanged, and check them all
   again at Stage 6.
8. Change `step-3-cookbook.md` (remove "inspection budget" and "a stated
   priority choice"), `step-4-cookbook.md`, `step-5-cookbook.md` and
   `record-format.md` "Entry analysis" and "Discovery".

### GB-09b Investigate reported-unused files before a deferral

**Draft. Plan change 20 decides it after the first real run.**

**Finding:** P9 and P10. **Needs:** GB-09a, GB-10.

**Constraints:** behavior `deferrals.feature`. Interface: deferrals use
`reportRefs` (DB9). Observability and architecture: the defaults.

Add to `deferrals.feature`:

```gherkin
  Scenario: A deferral of a reported-unused file cites its investigation
    Given a Stage 3 attempt in which Knip reports "app.ts" as an unused file
    And a Stage 3 review that defers "app.ts" without citing the reported file record
    When the operator finishes Stage 3
    Then the Stage 3 result is not published
    And the operator is told which reported-unused file the deferral did not investigate

  Scenario: A suspected-unused gap follows the same rule
    Given a Stage 3 attempt in which Knip reports "app.ts" as an unused file
    And a Stage 3 review with a suspected-unused gap for that file that cites its reported file record and a search for "app"
    When the operator finishes Stage 3
    Then the Stage 3 drafts are published
```

**Fails today because** no record links a deferral to the Knip report of its
files. The second scenario is a guard: after GB-10 it passes, and it must still
pass. The Docker double reports `app.ts` as unused
(`support/doubles/docker.py:77`). The Stage 3 support skips Knip today, so the
Given runs Stage 2 with a package manifest and the doubles on `PATH`
(`pathWithDoubles`). No Docker engine is needed.

**Steps:**

1. **U** A deferral, or a gap of `kind: suspected-unused`, whose subjects cover
   a reported-unused file cites that file's `reported-files.json#/files/K` entry
   in `reportRefs`, and a search that names the file.
2. **U** A skipped Knip report gives no reported files and no requirement
   (design 880-881).
3. **N** The Stage 3 finalizer, the Stage 4/5 publisher and the shared validator
   check it.
4. Change `step-3-cookbook.md` and `record-format.md`.

### GB-10 Collect evidence for reported-unused files

**Draft. Plan change 20 decides it after the first real run.**

**Finding:** P10. **Needs:** nothing.

**Constraints:** behavior `reported-unused.feature`. Interface: a new
`reported-files.json` record (DB13). Observability and architecture: the
defaults.

New feature file `cookbook/behavior/producer/reported-unused.feature`:

```gherkin
@producer
Feature: Investigate files that Knip reports as unused
  Stage 3 collects evidence for each file that a completed Knip report names as
  unused. A skipped report names no file.

  Scenario: Stage 3 collects evidence for a reported-unused file
    Given a Stage 2 result in which Knip reports "app.ts" as an unused file
    When the operator collects the Stage 3 evidence
    Then the reported files record lists "app.ts" with the Knip report that names it
    And it lists the places that mention the file name
    And an excerpt of the file is ready for review

  Scenario: A skipped Knip report gives no reported files
    Given a Stage 2 result in which Knip was skipped
    When the operator collects the Stage 3 evidence
    Then the reported files record is empty and says that no report was available
```

**Fails today because** `addReportedSymbols` reads only `exports` and `types`
(`stage-3-collect.ts:33-48`), and the excerpt list leaves out unused files. The
first Given runs Stage 2 with a package manifest and the doubles on `PATH`, as
GB-09b does.

**Steps:**

1. **U** Stage 3 collect saves `reported-files.json`: a status, worked out as
   `symbolStatus` does (`stage-3-collect.ts:199`), and for each reported-unused
   file `{path, sha256, modes, reportRefs, folder}`, grouped by folder.
2. **U** Each file gets mention evidence from the same syntax pass: string
   literals and loading matches whose last segment is the file stem.
3. **U** The reported files join the initial excerpt list.
4. **N** The Stage 3 finalizer checks the receipt of `reported-files.json` with
   the other collected files.
5. Change `interface/stage-3/commands.test.ts` where it checks the exact collect
   summary.
6. Change `step-3-cookbook.md` and `record-format.md`.

---

### Not planned

Plan change 20 replaces these revision 2 tickets. Commit 3cc3dc1 has their full
text.

| Revision 2 ticket | Finding | Why it is not planned |
|---|---|---|
| GB-05a, GB-05b (baseline identity, stage times, tools and models in the run manifest) | P5 | The run manifest and the records that it registers are the run record (design text in #101). |
| GB-06a, GB-06b (complete Stage 1 tool-call records, a time limit for Stage 2 commands) | P6 | A scope or limit for each call adds nothing to a command that the producer fixes (design text in #101). GB-06b also covered the Stage 2 time limit, which plan change 20 does not name. |
| The prompt-version steps of GB-07c to GB-07f (`promptTemplate` in the call record) | P7 | The producer code digest and the saved cookbook copy identify the template (design text in #101). |
| GB-11a, GB-11b (retry a capture, list the excluded paths) | P11 | Capture stops on a change, and the exclusions stay as rules (design text in #101). |
| GB-13a, GB-13b (Stage 5 adds roots and refreshes reachability) | P13 | After Stage 4 publication, a root or settings correction needs a new run (design text in #101). |
| GB-12a to GB-12d of revision 2 (one lock, one draft reader, draft digests, a cleanup action) | P12 | Plan change 20 decides only that Stages 2 and 3 write the run manifest last and roll back. The new GB-12a and GB-12b do that. |
| GB-01a of revision 2 (the viewer stops placing dotted file names) | P1 | Plan change 20 keeps the viewer's rule. |

### Not covered by Appendix B

- **Defects 2 and 4** of the report. Draft #101 fixes Defect 2 and records that
  the owner accepts Defect 4.
- **The rules enforced only by the operator or LLM** (the list above). This
  plan does not check them.
- **The correction note rule.** "Any retained minor prose error has an explicit
  correction note and supporting facts" (design 776) stays a manual rule.
- **An "analysis unsupported" route for the dependency graph** (design
  450-451). A graph failure still stops the run (DB5).
- **Gaps for partial searches.** A text search with the outcome `truncated`
  (`stage-3-text-search.ts:127`) and a references record with
  `completeness: partial` (`stage-4-references.ts:246`) give no required gap.
  Draft GB-09a uses a truncated search only as `run-limit` evidence.
- **Limits of the tool gap tickets.** The ID form of a Stage 3 exports request
  that failed, and thus saved no record, is not reserved (GB-04b). A compiler
  input that the two Stage 4 candidate records name gives two required gaps.
  The limit of 5,000 records of the discovery is not handled for a very large
  number of settings values that cannot be read (GB-04c). The completion check
  does not list the candidate records of an earlier Stage 4 attempt (GB-04d).
- **Reserved gap IDs after the stage.** Each stage refuses another record with
  the reserved ID form of its required gaps. A later stage does not. A Stage 5
  draft can thus add a gap with an ID such as `s2-001-knip-gap-009`. Such a
  gap cannot go around the subject check, because the forms that keep the
  subjects of a tool record also fix the evidence reference.
- **Folder subjects with selector characters.** A folder subject is compared
  as text with the folders of the snapshot, so `src/app/[id]/**` is a valid
  subject, although a membership selector cannot contain `[` (GB-01a).
- **A status for questions and gaps.** It needs discovery `formatVersion: 3`
  and a viewer change (DB4). Current overview prose stays an LLM review item.
- **Dotted file names.** Under the viewer's rule (DB1), a subject such as
  `cli.ts` names the item `cli` when that item exists. The check accepts it,
  and the viewer places it on that item.
- **P12 beyond plan change 20.** Stage 1 to 3 actions check no publication
  lock, no reader compares the drafts with `run.yaml`, and there is no cleanup
  action. Stage 1 writes `run.yaml` directly; it is the first publication of a
  run.
- **Stage 3 candidates outside the roots.** A Stage 3 source candidate outside
  the Stage 2 plan patterns is not checked against the roots at Stage 4.
- **Candidate IDs after a repeated Stage 2.** A new Stage 2 attempt before
  Stage 4 gives new candidate IDs, because new IDs start with the attempt ID
  (`stage-2-finish.ts`). Not confirmed in a run.
- **The new design drift** listed under "Design-document drift to fix".
