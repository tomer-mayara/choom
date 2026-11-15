# Step 1 gap / surplus report

Design: `docs/design/llm-led-architecture-analysis.md` (updated 2026-11-08).
Code reviewed at `2184d9d` (main). Review was read-only.

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

## Gaps: in the design, not in code

### Missing capabilities

| # | Gap | Design | Evidence |
|---|---|---|---|
| G1 | **Accepted statements and `acceptanceRef`:** the producer rejects anything except `proposed`. No route creates a child baseline version (the producer always writes `parentId: null`). Acceptance and versioning exist only as fields the viewer can read. | 152–160, 615–616 | `stage-6-records.mjs:459-460`; `record-format.md:65` |
| G2 | **Dividing a file into code units with the syntax tree:** `unitKind` must be `file`. | 174–180 | `stage-6-records.mjs:663`; `record-format.md:505` |
| G3 | **Symbol membership selectors:** only an exact path or `/**`. The viewer also accepts `src/a.ts#decode` as an exact path without an error. | 147 | `stage-6-records.mjs:446-449`; `src/domain/baseline.ts:8-13` |
| G4 | **Git evidence:** no helper collects any, and `.git` is excluded at capture. | 458 | `stage-1-commands.mjs:127` |
| G5 | **ripgrep:** not used. Content search is a TypeScript `createSourceFile` scan. | 741 | `stage-3-commands.mjs:308` |
| G6 | **ts-morph:** the helpers use the raw TypeScript parser, with no ts-morph project and no definition or reference queries. | 742, 876 | `stage-4-inspect.mjs:188`; `stage-5-query.mjs:280` |
| G7 | **Behavior-entry syntax rules:** there are no route, worker or command rules. Resource access is matched by name only. | 877–878 | `stage-4-inspect.mjs:176-179` |
| G8 | **Approved framework plugins for Knip:** all plugins are turned off, so entries found only by plugins are lost. | 782–783, 788 | `step-2-cookbook.md:364,432` |
| G9 | **Named parsing profile when there are no project settings:** not present. | 768–769 | Stage 1 helpers |
| G10 | **Node `type` field:** not read. Each file gets both an import pass and a require pass. | 866 | `stage-4-commands.mjs:245-254` |
| G11 | **Gaps, deferred regions, uncovered code and questions in the Baseline view, and corrections submitted from it:** the viewer loads no discovery data and has no editing. | 190–191, 392–394 | Deferred by `cr-baseline-viewer-plan.md:48-49`; the design does not say so |
| G12 | **"Do not save hidden reasoning":** not stated anywhere. The cookbooks ask for the "complete response". | 475 | `step-1-cookbook.md:245`, `step-2-cookbook.md:1105`, `step-3-cookbook.md:260` |

### Partial: present but weaker than the design

| # | Item | Design | Evidence |
|---|---|---|---|
| P1 | **Completion check "references resolve":** a question or gap `subjectRefs` that names nothing passes. | 710 | `stage-6-records.mjs:633` (only checks the value is a list of non-empty strings; confirmed by a probe) |
| P2 | **Completion check "explanations cite evidence":** inspected-path steps can cite an excerpt that was collected but never reviewed. Only the entry site must be in a reviewed range. | 716–717 | `stage-6-records.mjs:718-726` |
| P3 | **Completion check "summaries are current":** `run.yaml` keeps "The baseline is not yet recovered." through Stages 4–5. `coverage.unresolved` counts historical questions and gaps as well as current ones. | 450–452, 720–721 | `stage-4-5-publish.mjs:232-236`; `stage-6-commands.mjs:400-402` |
| P4 | **Unavailable analysis needs a result record and a gap:** no check links the two. | 950 | `stage-6-records.mjs` |
| P5 | **Run manifest:** no baseline ID or digest before Stage 6. Tool and model versions are reachable only through artifacts. No times per stage. | 457 | `stage-1-commands.mjs:336-344` |
| P6 | **Tool-call records in Stage 1:** only command, arguments, time and exit code. No scope, limits or output digests. | 464–467 | `stage-1-commands.mjs:40-43` |
| P7 | **LLM audit record:** no prompt-version field. The saved prompt is not compared with its template. Stages 2–3 do not check that cited evidence is a subset of supplied evidence. | 462 | `stage-3-finish.mjs:371` |
| P8 | **Entry candidates traced to metadata:** the LLM writes them. Code checks only that references resolve, not that the cited data contains the path or expression. | 801–802 | `step-2-cookbook.md:1344-1357` |
| P9 | **Deferral evidence:** there is no deferral type, so a "checked entry search" and a "precise claim" are not checked. The cookbook example ("inspection budget") conflicts with the design. | 846–848 | `stage-3-finish.mjs:391-395`; `step-3-cookbook.md:234-235` |
| P10 | **Investigate reported-unused files before a deferral:** the Stage 3 collector queries only unused exports and types. | 825–827 | `stage-3-commands.mjs:217,361-369` |
| P11 | **Concurrent edits:** a change is detected and capture stops; any retry is manual. Excluded paths are not listed, only the rules. | 426–428, 473 | `stage-1-commands.mjs:126-130,162-166` |
| P12 | **Publishing two files as one update:** temporary files are renamed one at a time. Stage 2 renames discovery before the manifest; Stage 3 does the reverse. | 477–480 | `step-2-cookbook.md:1441-1442`; `stage-3-finish.mjs:474-485` |
| P13 | **Revisit affected work before Stage 6:** roots are frozen after Stage 4, and `record-format.md` says to start a new run instead. | 959–961 | `stage-4-5-publish.mjs:208-219`; `record-format.md:489-495` |

### Enforced only by the operator or LLM

These rules depend on the cookbook prompts and are not checked by code:

- Unknown file roles stay unknown.
- Compiler inclusion is not an entry point.
- Workers, migrations and outside consumers are considered.
- An unused export does not make its file unused.
- Component declarations are included despite the excerpt cap. `component.yaml` sorts last under the 40-path cap (`stage-4-inspect.mjs:314-321`).
- No "utilities" component is created to remove unknowns.
- Prose is refreshed.
- Preflight checks for Docker, access and versions are done.
- Minor corrections are recorded as dated notes.

## Surplus: in code, not in Step 1 of the design

| # | Surplus | Documented elsewhere? |
|---|---|---|
| S1 | **Baseline `formatVersion: 4` with `systemEntryPoints`.** The producer, validator and viewer all support it (Startup/External markers, entry lists). Version 4 also follows the version 3 arrow rules. | Yes: CR-003 and `record-format.md` "Version 4". **Not in the main design**, which still says versions 1–3. |
| S2 | **Duplication assessment and report** (detector, review, binding, list, comparison, badges). | Yes: design Step 2/Step 3 and `app-a/duplication-assessment.md`. It is a later step, not Step 1. |
| S3 | **Producer profile stricter than the design:** at least one component is required, `purpose` and `groupingReason` cannot be `null`, every component, including a grouping parent, needs `paths`, inspected paths need `steps` and `limits` (the design's own example fails), readiness must be `ready-with-gaps`, inspection priorities must be 3 or less and must not go down, and the LLM response must contain the record text exactly. | Partly, in `record-format.md`. These conflict with design 617–618 and with the 675–680 example. |
| S4 | **Viewer YAML profile and display limits enforced in the producer.** | `record-format.md` "Reader limits" |
| S5 | **`recover-capture.mjs`:** it hard-codes Choom-specific exclusions, writes a Choom-specific `dist` note for any target, silently skips hidden directories (conflicts with design 755), and its output cannot be finished by `stage-1-commands.mjs finish`. | Its cookbook admits the last point (`step-1-cookbook.md:435-437`). Not in the design. |
| S6 | **Other helper behavior:** the `work-choom` layout, rejection of symbolic links, Knip skip rules (a `knip` key in a manifest skips Knip), `--no-gitignore`, `KNIP_DISABLE_RAW_TRANSFER`, Stage 2 `prepare` changing registry paths (conflicts with "keep completed records unchanged", 449), and `inventory-view.py consolidate` deleting old input folders. | No |
| S7 | **Viewer reading aids:** v2 documentation detail (examples, Copy example, source notes, provenance), the Used by / Caller source views, canvas behavior, the load workflow (Cancel/Retry), and the built-in starter example. | Yes: viewer plan and readability plan (BV-*, BR-*) |
| S8 | `scripts/analyze.ts` (ts-morph counts) and `scripts/validate-components.ts` (repository `component.yaml`). | The Compatibility section mentions the counts script. Repository tooling, not Step 1. |

## Defects found on the way

1. **Reserved ID mismatch.** Stage 6 reserves the baseline ID as an item ID; the Stage 4/5 publisher does not. A component whose ID equals the baseline ID passes Stage 5, then fails at Stage 6, after Stage 5 can no longer be reopened. A probe confirmed this. (`stage-6-commands.mjs:216` vs `stage-4-5-publish.mjs:224`)
2. **The built-in starter baseline breaks single ownership.** It lists `src/**`, `src/domain/**` and `src/platform/**` as three top-level components with no parents, so `src/domain` and `src/platform` files have two direct owners. (`src/domain/starter-baseline.ts:10-17`)
3. **`picomatch` is not declared.** It is loaded from `node_modules` but is not a dependency. (`stage-4-commands.mjs:226`)
4. **The Knip image is not fully pinned.** The base image tag and transitive dependencies are recorded but not pinned. (`step-2-cookbook.md:663-665`)

## Design-document drift to fix

- Appendix A (602–611) lists versions 1–3 only. Add version 4, or link CR-003.
- The Report views bullet (392–394) promises gaps, deferred regions and corrections, which Compatibility (522–523) rules out. Mark the bullet as deferred.
- Line 147 says "paths or symbols"; the producer and viewer support paths only.
- Line 741 says ripgrep and lines 742/876 say ts-morph; the helpers use the TypeScript API.
- The smell catalog is called "eight families" (208) and "seven-family" (547).
- The Contents list omits "Duplicated public capabilities" and "Duplicated-interface report".
- `record-format.md:89`, `step-6-cookbook.md:15-17` and `start-here.md:75` still say "versions 2/3" or "three versions".
- The viewer plan's BV-05 display table is stale. The readability plan replaced it.

## Verification limits

- All helpers pass `node --check`.
- Validator probes ran against an in-memory copy of the producer fixture. They confirmed P1, P2 and Defect 1, and that `accepted`, parent cycles, duplicate owners, non-file units and glob selectors are rejected.
- Arc probes confirmed that version 3/4 files never draw permission arrows.
- **No unit, behavior or producer test ran.** `node_modules` is not installed, Node here is 22.23 (the project needs 26.13 or later), and Docker was not used. Before acting on this report, run `bun install`, then `bun run test`, `bun test ./test/interface` and the Stage 4 Docker graph fixture.


---

## Appendix A: Gaps - tickets

Revision 3, 2026-11-15. This plan closes gaps G1–G12. The owner made the
decisions in the log below. Revision 3 corrects the errors that the review of
revision 2 found (see "What changed in revision 3").

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
| E10 | GA-05: Bun does not run the install scripts of dependencies unless they are listed in `trustedDependencies`. So `@vscode/ripgrep` would install without its program. | GA-05 adds it to `trustedDependencies` and checks that the program exists after `bun install`. |
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
| D15 | G8 | Plugins run with `config: []`, so they use only their default file-name patterns and never load settings files. There is no approval list. This is not yet tested on Knip 6.44.1: GA-08 tests it first. |
| D16 | ripgrep | `@vscode/ripgrep` at an exact version, listed in `trustedDependencies`. |
| D17 | G11 | CR-004 is approved in principle. The viewer shows discovery questions and gaps, and can copy a decision-file entry. There is no editor in the viewer. |
| D18 | Docker tests | A CI `producer` job runs `@docker` scenarios. `bun run check` skips them. |
| D19 | G4 | Git identity only. History is left to Step 2 planning. |
| D20 | Old discovery files in the viewer | Approved by the owner on 2026-11-15. The viewer refuses a discovery result without `baselineDigest`, because an ID alone can match the wrong baseline. Old runs need a new run to show in the viewer. |

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
| 4 | GA-00e Record and check the producer code digest | setup | GA-00b |
| 4 | GA-DOC Change the design text to match the decisions | docs | — |
| 5 | GA-12 Do not save hidden reasoning | G12 | GA-00b |
| 5 | GA-09 Named parsing profile | G9 | GA-00b |
| 5 | GA-04 Git identity | G4 | GA-00b |
| 5 | GA-05 ripgrep search | G5 | GA-00b |
| 5 | GA-06a ts-morph project on the snapshot | G6 | GA-00b |
| 5 | GA-10 Node `type` field | G10 | GA-00d |
| 5 | GA-01a Decision file | G1 | GA-00c |
| 6 | GA-06b Definition and reference queries | G6 | GA-06a |
| 6 | GA-01b Make the next baseline version | G1 | GA-01a |
| 6 | GA-03b Symbol selectors in `formatVersion: 5` | G3 | GA-00a, GA-03a |
| 6 | GA-07a Entry rule engine | G7 | GA-06a |
| 7 | GA-02a Symbol selectors divide files | G2, G3 | GA-03b, GA-06a |
| 7 | GA-07b–e Rules for each kind of target | G7 | GA-07a |
| 7 | GA-07f Resource access by receiver type | G7 | GA-06b |
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

**Gap:** setup (D7, E7, E8). **Needs:** GA-00b.

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
   when any file in `packages/producer/src` changes.
2. **U** The receipt has the package version, the digest, and the Git commit or
   `not-available`.
3. **U** Each stage action compares the current digest with the receipt and
   refuses a difference.
4. Remove the code that saves source copies in each run.

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

1. **U** `checkVisibleResponse(text, providerJson?)` refuses provider content
   blocks of type `thinking`, `redacted_thinking` or `reasoning`, and a
   `<thinking>` block at the top level of the saved text.
2. **U** The call record must have `hiddenReasoning: "not-saved"`. A missing
   value or another value is refused.
3. **U** Every `finish` action (Stages 1–3 and the Stage 4/5 publisher) uses
   this one check.
4. In the three cookbooks, change "complete response" to "complete visible
   response. Do not save hidden reasoning."

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
2. **U** It runs only `rev-parse` and `status --porcelain=v2`. Every command
   sets `-c core.fsmonitor=false -c core.hooksPath=/dev/null`,
   `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null` and
   `GIT_OPTIONAL_LOCKS=0`, so target settings cannot run a program. The test
   double refuses any other command or a missing setting.
3. **U** A Git refusal (for example, "dubious ownership") gives `not-available`
   with Git's message. It does not stop the capture.
4. **N** Run it on a temporary real repository. The record is saved by digest
   and appears in the tool-call record.
5. **U** Stage 1 `finish` adds the `git-unavailable` gap when needed.

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

1. Add `@vscode/ripgrep` at an exact version and list it in
   `trustedDependencies` (E10). **N** After `bun install`, the program exists
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
5. Replace the `ts.createSourceFile` calls in Stages 3–5 with this project.
   The characterization tests still pass.

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

### GA-10 Use the Node `type` field when resolving imports

**Gap:** G10 (design 866). **Needs:** GA-00d.

```gherkin
@producer @docker
Feature: Resolve imports by module kind

  Scenario: An ES module file uses the import condition only
    Given a package with type "module" that imports a dependency with separate import and require targets
    When the dependency graph is built
    Then the edge points to the import target only

  Scenario: A CommonJS file uses the require condition only
    Given a ".cjs" file in the same package that requires the same dependency
    When the dependency graph is built
    Then the edge points to the require target only
```

It fails today because every file gets both an import pass and a require pass.

**Steps:**

1. **U** `moduleKind(path, nearestPackage)`: `.mjs` and `.mts` are ES modules;
   `.cjs` and `.cts` are CommonJS; other files use the nearest `package.json`
   `type` (default `commonjs`).
2. **U** A TypeScript file uses the compiler `module` setting when that setting
   decides the output kind. The record says which rule decided.
3. **U** From each pass, keep only the edges for files of that kind. A file of
   unknown kind keeps both, with a reason.
4. **D** A dependency-cruiser fixture with dual-condition exports gives the
   edges in the scenarios.

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

**Gap:** G2 and G3 (design 174–188), D13. **Needs:** GA-03b, GA-06a.

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

**Gap:** G7 (design 240–245, 877–878). **Needs:** GA-06b.

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
  This is a small fix: add `parent` links or `excludePaths`.
- **Defect 4:** the Knip image base tag and its transitive dependencies are not
  pinned (`step-2-cookbook.md:663-665`).
- **P1–P13:** the partial findings. GA-11b works around P1 (unknown subjects
  become "Unplaced"). GA-00c fixes defect 1. GA-12 and GA-00e touch P7 but do
  not close it (P7 also asks for a prompt-version field, a template check, and
  a check that cited evidence was supplied).
