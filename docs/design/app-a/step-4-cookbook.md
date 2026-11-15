# Appendix A, step 4: recover candidate components

Use this after the [step 3 cookbook](step-3-cookbook.md) has finalized its result.
For prerequisites and the complete sequence, read [start here](start-here.md).
Start with the saved entry analysis and its inspection priorities. Build
dependency evidence, then use the LLM to recover
the apparent intended architecture from source and documents.

This is baseline recovery. Observed imports do not define allowed access.
Component declarations and directories are clues. Each proposed boundary needs
source evidence and a reason for its grouping. Boundary problems and redesign
belong to Step 2 of the design.

The commands below prepare the evidence, validate the LLM review packet, and
publish the proposed model into the working drafts.

## Contents

- [1. Start an attempt](#1-start-an-attempt)
- [2. Prepare the graph toolchain](#2-prepare-the-graph-toolchain)
- [3. Collect dependency evidence](#3-collect-dependency-evidence)
- [Recover an incomplete saved input](#recover-an-incomplete-saved-input)
- [4. Collect source evidence](#4-collect-source-evidence)
  - [Find the references to a symbol](#find-the-references-to-a-symbol)
- [5. Ask the LLM to recover components](#5-ask-the-llm-to-recover-components)
- [6. Check the proposed result](#6-check-the-proposed-result)
- [Saved state](#saved-state)

## 1. Start an attempt

Keep `CHOOM_WORK` and `CHOOM_TOOLS` from stage 3. Use a new attempt ID and keep
earlier attempts unchanged.

```sh
export CHOOM_STAGE4_ID="s4-001"
export CHOOM_STAGE4="$CHOOM_WORK/evidence/$CHOOM_STAGE4_ID"

node "$CHOOM_TOOLS/packages/producer/src/cli.ts" stage-4 start
```

The helper first checks the [producer code record](record-format.md#producer-code-record)
of the run. It then verifies the working drafts and every registered artifact. It
requires completed stage 3 inspection priorities, a selected entry analysis that
supports Knip reuse, and an empty initial baseline. It saves checkpoints and
copies of this cookbook and the record format into the new attempt. Every later
command, the inspection helper and the publication commands in section 6 run from
the tool checkout and make the same producer code check first.
The input remains the empty version 1 seed. Versions 1 and 2 remain readable.
Use version 3 for [source-use assessments](record-format.md#version-3-source-use-assessments)
without a system-entry assessment. Use version 4 when a
[system-entry assessment](record-format.md#version-4-system-entry-points)
is present. Both formats retain version 2
[interface documentation](record-format.md#version-2-interface-documentation)
and signatures. When both assessments are present, they must name the same
snapshot and candidate mapping.
Keep unknown facts explicit. Review a source range before claiming that it
supports an example; a collected excerpt alone is insufficient. Check the full
baseline against the reader limits before publication.

Before creating the attempt, it also checks every indexed snapshot path, file
type, and byte count. This catches missing or truncated input before the toolchain
build. It is a metadata check; full content verification still happens when the
inventory-only input is prepared and checked for the graph run.

The helper prepares `graph-profile.json` from the saved source scope, settings,
and explicit entry patterns. These choices are recorded before the graph runs.
Graph scan files and traversal roots are different:

- Scan every supported source file in the selected scope, including files with
  no known entry connection and generated TypeScript.
- Start traversal only from the explicit entry patterns in the retained plan.
  Save the matching files and pattern references. These are Choom's selected
  roots, not a claim about Knip's complete effective roots.

The profile scans every regular JavaScript and TypeScript file in the saved
stage 3 scope, including sources outside conventional `src/` directories. Each
fully parsed compiler configuration uses its saved `fileNames` selection. If a
file belongs to several configurations, each context keeps that file separately.
In a snapshot with project settings, files without a supported compiler
selection use a named configuration-free fallback with no compiler options. A
snapshot without project settings has a settings record that names the Choom
parsing profile (see the [record format](record-format.md#settings-record)). Its
source uses one group named after the profile, such as `choom-default-v1`, with
the profile's options and `compilerSettingsRef: settings-001#/parsingProfile`.
The helper refuses a settings record that names an unknown profile.

Each group has separate import and require passes with platform-neutral
`import`/`require` and `default` conditions. The import pass reads ES module
syntax and TypeScript references with the `import` condition. The require pass
reads CommonJS syntax with the `require` condition. Browser, Node, Bun, custom and
TypeScript-specific package conditions remain unassessed. The helper does not
infer a runtime from a directory name or execute target configuration.

Stage 4 start also decides the module kind of the code that runs for each file
of a group (`stage-4-module-kinds.ts`). TypeScript that compiles to CommonJS
turns its `import` statements into `require` calls:

- A `.mts` file is an ES module and a `.cts` file is CommonJS, as Node runs the
  compiled `.mjs` and `.cjs` files (`decidedBy: extension`).
- For a `.ts` or `.tsx` file, the `module` setting of the group decides:
  CommonJS gives CommonJS, and ES2015 to ESNext give ES modules
  (`compiler-module`). With Node16, Node18, Node20 or NodeNext, the `type` of
  the nearest indexed `package.json` decides, and without a `type` or without
  a `package.json` the file is CommonJS (`package-type`).
- JavaScript files, `module: preserve` and a group with no `module` setting keep
  the syntax as written (`syntax`). Snapshots without project settings use the
  Choom parsing profile, which sets `module: preserve`.
- `module` None, AMD, UMD or System, a `package.json` that is not a valid JSON
  object, and a `type` other than `module` or `commonjs` give an unknown kind
  with a reason (`unknown`). Such a file keeps the passes of its syntax.

A group in which some files compile to CommonJS gets a third pass,
`<group>-commonjs`. It reads ES module syntax, TypeScript references and
CommonJS syntax with the `require` condition, and keeps only the imports of
those files. It reads their `require` calls only so that dependency-cruiser
finds the imports that the compiled code keeps; the require pass keeps the
`require` calls. So a value import is not `pre-compilation-only`, and a
type-only import or re-export stays `pre-compilation-only`. The import pass and
the CommonJS pass both name those files in `compiledToCommonJS`. The import pass
keeps none of their imports, except an `import()` call that the compiled code
keeps. With `module: commonjs`, TypeScript compiles an `import()` call into a
`require` call, so the CommonJS pass keeps it, with the `require` condition and
not `pre-compilation-only`. With any other setting, the call stays, and the import
pass keeps it with the `import` condition. A JavaScript `import()` call keeps the
`import` condition, as in Node. Traversal stays within each pass. In a group with
both kinds, a pass can reach a file whose own edges are in another pass, and
stops there; that file is not unused.

`graph-profile-notes.json` lists in `moduleKinds` each file whose module kind
its syntax does not decide: its group, kind, rule (`decidedBy`), the compiler
setting reference (`setting`), the `package.json` and the reason. The module
kinds do not cover `createRequire` in ES modules, conditions in `typesVersions`,
bundler resolution, or TypeScript that a bundler, not `tsc`, compiles. Review
those files from their source.

The profile passes only the saved target, module, module-resolution, JSX and
verbatim-module options to the parser. It approximates simple single-target
`paths` aliases within the snapshot. Unsupported aliases and `baseUrl`-only
resolution are recorded in `graph-profile-notes.json`; they can leave unresolved
edges. Compiler context boundaries stop traversal. Do not combine their
reachability results into a complete runtime graph.

This manual graph profile needs at least one regular JS/TS file and a regular-file
inventory. Framework source forms such as `.vue` and `.svelte` need separate
source evidence and stay outside this graph. Source filenames containing glob
characters stop preparation with a reason. The selected settings artifact is
`settings-001`, which stage 1 freezes after its final settings review.

## 2. Prepare the graph toolchain

Check Docker access from the executor that will run the following command,
before consuming this phase. If that executor cannot reach the local daemon,
leave `toolchain` and `run` unconsumed and retain the prepared attempt for an
executor that can. Follow the prerequisites in [start here](start-here.md).
The saved commands, profile, receipts and digests establish the handoff; terminal
output alone does not establish a completed graph run.

```sh
node "$CHOOM_TOOLS/packages/producer/src/cli.ts" stage-4 toolchain
```

This builds a dedicated Docker image with dependency-cruiser 18.7.2 and
TypeScript 6.0.2. Dependency installation is confined to the tool image, uses
fixed requested versions, and disables installation scripts and optional peer
tool loading. The build has no target repository mount. It can require network
access to obtain the tool image and packages.

The helper records the image ID, package lock, versions, command outcomes, and
fixture result. The image runs the fixture with the graph helper at the same
container path as the graph run. The fixture checks aliases, type-only imports,
dynamic imports, conditional package imports, a CommonJS pass for a `.cts` file,
overlapping scan contexts, unresolved targets and configuration traps. A fixture
pass covers those cases; it does not prove complete target coverage.

The graph engine uses the API and its built-in JSON reporter. It passes
Choom-owned data directly. It does not load a target rule file, custom reporter,
Babel configuration, or target plugins. A broad mount of host `node_modules`
would expose additional tool paths, so this workflow uses the dedicated image.

If this command fails, keep its logs and stop. Fix the toolchain in a new attempt
before running the graph. Do not substitute an unrestricted local analyzer run.

## 3. Collect dependency evidence

```sh
node "$CHOOM_TOOLS/packages/producer/src/cli.ts" stage-4 run
```

The input helper prepares or verifies the shared inventory-only copy. Its path
uses the inventory digest; stage 2 and stage 4 can reuse the same verified copy.
The graph container receives that copy at `/repo`, read-only. It also receives
the saved control files at `/control` and the graph helper `stage-4-graph.ts`
from the tool checkout as `/producer/stage-4-graph.mts`, read-only. Node runs a
`.mts` file as an ES module and removes its TypeScript types, so the image needs
no compiler and no `package.json` for the helper. The helper imports only Node
built-ins. The container has no network and cannot see the live
checkout or excluded source inputs. The helper requires a local Docker endpoint
and records the selected image and command. It verifies the input copy again
after the run.

The engine scans each context separately with these explicit settings:

- `parser: "tsc"` and `tsPreCompilationDeps: "specify"`.
- `exportsFields: ["exports"]` and `importsFields: ["imports"]`.
- Separate `import` and `require` conditions, each with `default`. These are
  platform-neutral source-analysis passes, not claims about the target runtime.
  A CommonJS pass uses the `require` condition. Each pass keeps only the edges
  of the files that it owns, and its `limits` say what it keeps.
- Resolver targets stay within `/repo`. Installed target dependencies remain
  unavailable. Missing packages remain visible in the raw evidence.
- `doNotFollow: "^"` prevents recursive parsing. Each selected source file is
  supplied as an explicit scan root. This keeps each scan within its context.

`graph-results.json` retains raw dependency-cruiser output for each context and
normalized edges with references back to the raw records. It keeps unresolved
targets, built-ins, missing declared packages, and resolved targets outside the
current context. It records failures as failures or partial results, not empty
successful graphs.
Publication requires an actual completed run with every context completed.
A skipped Knip result from Stage 2 does not permit a skipped or inferred graph.
Read the run and context statuses separately from their coverage limits.
A completed `require` context can contain no dependency edges; an empty edge
list does not by itself mean the tool failed to execute. The same applies to an
import pass whose files all compile to CommonJS.

Choom traverses retained internal source edges from the recorded roots. This
includes type-only, re-export, and literal dynamic dependencies. It saves reached
files, files not reached in that graph, and edges where traversal stopped.

These results are source relationships. They do not prove runtime execution or
unused code. A target outside the current context is a traversal boundary. Do
not merge incompatible context results or treat missing edges as absence.

The pinned analyzer can lose type-only labels on unresolved imports and combine
static and dynamic imports of the same specifier. The next source query retains
the expressions needed to investigate those limits. Its results do not silently
repair or replace the raw graph.

## Recover an incomplete saved input

An error from `graph-input-prepare.stderr.txt` can mean that a captured file is
now missing or changed. The input copy is checked against the full registered
inventory, including captured build output. A file can block that check even
when it is outside the graph's source scan.

Keep the failed attempt, its logs, and the inventory unchanged. Check the
snapshot and any saved input copies against the inventory. Check all paths for
missing files and type or size differences; the first reported path may not be
the only problem. A metadata check does not verify the remaining file contents.

There are two recovery paths:

- Restore the original bytes from a saved copy. Verify each replacement against
  its registered SHA-256 digest before restoring it. Record the source and
  recovery operation outside the failed attempt. Then verify the complete input
  and start a new stage 4 attempt.
- If the original bytes are unavailable, start a new run with a new snapshot and
  an explicit capture scope. Consider excluding disposable build output while
  keeping required generated source and configuration. Record unavailable inputs
  and rerun the affected discovery stages against the new snapshot.

Do not rebuild a missing binary and assume it matches the captured bytes. Do not
remove failed paths from the old inventory or reinterpret a partial directory as
the complete saved input. A narrower graph input would need its own explicit
scope and provenance; the current helper does not implement that alternative.

For the supported end-to-end route, use [stage 1](step-1-cookbook.md) to create a
fresh capture. If the surviving old snapshot is the intended source, set
`CHOOM_TARGET` to that snapshot, choose new run, snapshot and baseline IDs, and
use a new working folder. Do not nest the new folder inside the old run.

Before capture, record in the new `evidence/scope-notes.md` that the source is an
incomplete older snapshot. List the missing or excluded paths and the inherited
capture limits. A fresh inventory describes only what was captured this time;
it does not certify that all surviving files still match the older inventory.
Verify retained bytes against that inventory separately if that lineage claim
is needed. Keep that verification as evidence. Never repair the old inventory
by removing missing paths.

Then follow all six stages again. Do not reuse old tool reports as results for
the new snapshot. The new source path and explicit scope distinguish this capture
from a fresh capture of the live repository.

[recover-capture.ts](../../../packages/producer/src/recover-capture.ts) is an exceptional utility retained for
the historical prototype. It verifies and copies a specific retained subset,
but writes a legacy capture layout. Its output is not a ready-to-finish input for
`stage-1-commands.ts`. It needs a separate reviewed publication process. Do not
use that utility as a shortcut through the standard instructions above.

## 4. Collect source evidence

```sh
node "$CHOOM_TOOLS/packages/producer/src/cli.ts" stage-4-inspect collect
```

This reads only indexed files whose saved hashes still match. It parses the
selected JavaScript and TypeScript source with the snapshot project (see the
[Stage 3 cookbook](step-3-cookbook.md#list-the-exports-of-a-source-file)): a
ts-morph project from the tool checkout that reads only the indexed snapshot
files. It uses no compiler settings, so TypeScript parses at the latest language
level. It saves:

| Artifact | Contents |
| --- | --- |
| `source-sites.json` | Import and re-export syntax, dynamic imports, and candidate resource calls. Includes query scope, the parser record, diagnostics, and limits. The parser record names the parser, Node, ts-morph and the TypeScript that it brings, and the digest of each tool file that ts-morph loaded. |
| `source-excerpts.json` | A bounded initial selection from priority files, entry candidates and component declarations, with file hashes, truncation and skipped paths. |
| `review-prompt.md` | The LLM review instructions with the current paths and evidence references. |
| `artifact-map.json` | Proposed artifact IDs and digests available at collection time. It omits itself, the mutable command log, and later files. |

Site lines count CRLF, CR and LF in the text that the parser read. A byte order
mark is not part of that text. It does not change the lines, and the diagnostic
`start` and `length` do not count it. Each later action of this helper loads
ts-morph again and compares its tool files with the parser record of
`source-sites.json`. If ts-morph or its TypeScript changed, the action stops
before it saves a receipt; start a new attempt.

The syntax query does not resolve bindings. A call named `writeFile`, `query`,
or `invoke` is a candidate site. It does not by itself establish resource access,
resource identity, or ownership. Mixed imports can contain type-only named
specifiers; their complete saved expressions remain available for review.

Initial excerpts contain at most the first 200 lines of a UTF-8 file of at most
2 MiB. Oversize and non-UTF-8 candidates are skipped with a reason; missing or
changed saved input still stops collection. These excerpt limits do not remove
files from the syntax or graph scope. The collector
uses paths named by inspection priorities, root README files, entry candidates
and saved `component.yaml` declarations. It saves at most 40 initial paths.
Omitted or truncated input is explicit. This is tool collection, not a claim
that the LLM has read those files.

Compare the saved selection and skipped paths with the inventory before recovery.
Declarations follow priority paths and entry candidates in the current selector,
so the 40-path cap can omit every `component.yaml`. Request omitted declarations
and relevant contracts, and follow truncated workflow bodies into later ranges
or other files when needed to support each reported path.

When the LLM needs more source, follow [Choose source ranges](start-here.md#choose-source-ranges)
before calling the helper. For example, request lines 1–150 of an indexed file:

```sh
node "$CHOOM_TOOLS/packages/producer/src/cli.ts" stage-4-inspect excerpt \
  "path/from/the/inventory.ts" 1 150
```

Each successful request saves a new numbered artifact and receipt. The helper
clips the end line to the file length when needed. Missing source outside the
inventory needs a new snapshot.
Use the returned source ID, snapshot ID, path, digest and exact saved range in
`reviewedFiles`. Keep that source ID distinct from its excerpt artifact ID.
Use bounded displays, and request any part lost to display truncation before
claiming to have inspected it.

Use the saved ranges to resolve interface consumers separately from permission.
Review calls, value references, callback/JSX bindings, and IPC registration as
needed. A query match is a place to inspect, not a resolved use. Keep type,
test, tooling, and self-use distinctions. Use the candidate mapping's direct
file owner; parent containment does not add a caller. Each use needs the actual
reviewed caller and all supporting binding ranges with matching located notes.
Keep unassessed interfaces, scoped empty results, and operator-command limits
explicit. Do not fill an unknown permission policy from source callers.

### Find the references to a symbol

After `collect`, the LLM can ask where a top-level symbol of a source file is
used. It gives the path and the symbol name, as for an excerpt. Run each request
separately:

```sh
node "$CHOOM_TOOLS/packages/producer/src/cli.ts" stage-4-inspect references \
  "src/billing/invoice.ts" createInvoice
```

The path must be a JavaScript or TypeScript file of the graph profile scope. The
symbol is an export name of the file (`default` for the default export and
`export=` for `export =`), else the name of a top-level declaration of the file.
An import is not a declaration of the file. Each request takes the next number,
also when it fails. Excerpt requests have their own numbers.

The helper opens the snapshot project of the Stage 3 exports action (see the
[Stage 3 cookbook](step-3-cookbook.md#list-the-exports-of-a-source-file)) with
the files and the compiler settings of one graph group:

- The scope is the import pass of the graph profile group that holds the file:
  its `sourceFiles` in `graph-profile.json`. The helper does not search the files
  of other groups. The compiler can read other indexed snapshot files to resolve
  imports, but the helper does not search them.
- The compiler settings are those of the group, chosen as for Stage 3 `exports`:
  the first fully parsed configuration of `settings-001` that selects the file,
  else the named Choom parsing profile, else no settings. The helper adds
  `allowJs`, so that the JavaScript files of the scope are part of the compiler
  program.
- Each file of the scope gets the module format that the compiler gives it: from
  its extension (`.mts` is an ES module and `.cts` is CommonJS) and, under Node16
  and NodeNext, from the `type` of its nearest `package.json`. Its imports resolve
  in that format, as `tsc` resolves them. For example, under NodeNext an ES module
  file needs the extension in a relative import.

The TypeScript type checker links each name of the scope to the symbol that it
names. The helper follows each alias to the declaration: renamed imports and
exports (`import { createInvoice as ci }` and
`export { createInvoice as make } from './invoice'`), `export * from`, namespace
imports (`billing.createInvoice()`), default imports, `import =` and the
JavaScript `require` calls that the compiler resolves. It also follows the local
names that a destructuring of a module object binds, such as
`const { createInvoice } = await import('./invoice')`. It does not follow a
`require` call in a TypeScript file or an import that the compiler settings do
not resolve (`unresolved` lists them; an import only with a relative module
name), or JSDoc types.

Some loading sites of `source-sites.json` in the scope can load the module of the
symbol, but the helper does not follow them. It lists each one in `unresolved`
with a `reason`, as a possible use that it does not resolve:

- A `dynamic-import`, `require-candidate`, `require-resolve-candidate` or
  `import-equals` site with a computed module name (`specifier: null`). The helper
  cannot tell which module the site names.
- A `require-candidate` site with a literal module name in a TypeScript file
  (`.ts`, `.tsx`, `.mts` or `.cts`). TypeScript does not follow a `require` call
  in a TypeScript file.
- An `import`, `re-export`, `import-equals`, `import-type`, literal
  `dynamic-import` or JavaScript `require-candidate` site whose relative module
  name (`./`, `../` or `/`, or `.` or `..` alone) the compiler settings do not
  resolve to a file. Examples are an import of a file that the capture did not
  save, and an extensionless relative import of an ES module under NodeNext.

The type checker follows a literal `require` call in a JavaScript file, and a
`require.resolve` call with a literal module name loads nothing, so the helper
does not list them. A bare package name, such as `zod`, names an external
package, which the snapshot never holds, and a relative name of a snapshot file
that is not source code, such as `./theme.css`, cannot hold the symbol, so the
helper does not list them either. The helper finds the saved site of each
unresolved import with the walk of the source collection. When no saved site
matches, for example after the site limit of `collect`, the entry has
`siteRef: null`, and its lines and expression come from the compiler syntax
tree. With an unresolved entry, the references can be incomplete.

The helper saves:

| File | Contents |
| --- | --- |
| `references-NNN.json` | The record below. |
| `operator-references-NNN.json` | The receipt, with the digest of the record. |

| Record field | Meaning |
| --- | --- |
| `formatVersion`, `attemptId`, `snapshotRef`, `status` | `1`, the Stage 4 attempt ID, the snapshot ID and `completed`. A refused request saves no record. |
| `path`, `sha256`, `symbol` | The source file, its inventory digest and the requested symbol. |
| `settingsRef`, `compilerSettingsRef`, `compilerSettings` | As in the Stage 3 exports record: the settings of the group and their reference. |
| `queryOptions` | What the helper adds to the compiler settings: `allowJs: true`. |
| `scope` | `graphContext`, the ID of the import pass; `graphContextRef`, a JSON Pointer to it in `graph-profile.json`; and `files`, the files that the query searched. |
| `tool` | The parser record of `source-sites.json` with the name of the type checker: the versions of Node, ts-morph and its TypeScript, and the digests of the tool files. |
| `virtualRoot` | `/repo`, the snapshot root as the project sees it. |
| `completeness` | `partial` when `unresolved` has an entry, else `complete-within-scope`. Neither value covers the files outside the scope or the uses that the helper does not follow. |
| `declarations` | The declarations of the symbol after its aliases: `path` and `range`. A declaration is not a reference. |
| `references` | Each site outside the declarations, by path and in source order: `path`, `range`, `kind` and `localName`. |
| `unresolved` | Each loading site of the scope that the helper does not follow: `siteRef` (a JSON Pointer into `source-sites.json`, or `null` when no saved site matches), `path`, `lines`, `kind`, `expression` and `reason`. |
| `gaps`, `outsideReads` | As in the Stage 3 exports record, for all files of the scope. |
| `notes` | What the list covers and does not cover, in plain text. |

`kind` is one of:

- `import`: an import, `import =` or JavaScript `require` that binds a local name
  to the symbol. The range is the import entry, such as `createInvoice as ci`.
- `re-export`: an export list entry, `export default`, `export =` or
  `export * from` that exports the symbol. `export * from` gives one entry for
  each name that the file exports as the symbol, and its range is the statement.
- `type`: a use in a type, such as an annotation, `typeof` in a type or an
  `implements` clause.
- `call`: a call, `new` expression, tagged template, decorator or JSX element
  that the reference starts. The closing tag of a JSX element is not listed.
- `value`: any other use, such as an assignment, an argument or a class
  `extends` clause. A destructuring that takes the symbol from a module object,
  such as `const { createInvoice } = await import('./invoice')`, is a value site
  whose range is the property name.

`localName` is the name that the site uses: the local name of an import or a
destructuring, such as `ci`; the export name of a re-export, such as `make`; or
the name expression of another use, such as `ci` or `billing.createInvoice`. A
`range` has 1-based lines and columns, as in the Stage 3 exports record. A byte
order mark is not counted.

A request for `createInvoice` in a small snapshot saves this record. Two users
import it, one through a `paths` alias of `tsconfig.json`, and `src/lazy.ts` takes
it from a dynamic import. `src/legacy.cts` takes it with a `require` call,
`src/plugins.ts` loads a module by a computed name, and `src/generated.ts`
re-exports a module that the capture did not save. The snapshot ID is an example,
and the tool digests and `notes` are cut:

```json
{
  "formatVersion": 1,
  "attemptId": "s4-001",
  "snapshotRef": "snapshot-001",
  "status": "completed",
  "path": "src/billing/invoice.ts",
  "sha256": "df3fcee4068a1ea8ffb65412db2671c4b80d5b628dd20adc0d12f3ea32b18c25",
  "symbol": "createInvoice",
  "settingsRef": "settings-001",
  "compilerSettingsRef": "settings-001#/configs/0",
  "compilerSettings": {
    "source": "configuration",
    "configPath": "tsconfig.json",
    "reason": "The first fully parsed configuration of settings-001 that selects the file.",
    "compilerOptions": { "strict": true, "module": 99, "moduleResolution": 100, "paths": { "@billing/*": ["./src/billing/*"] },
      "configFilePath": "/repo/tsconfig.json", "pathsBasePath": "/repo" },
    "otherContextRefs": []
  },
  "queryOptions": { "allowJs": true },
  "scope": {
    "graphContext": "compiler-1-import",
    "graphContextRef": "s4-001-file@graph-profile.json#/contexts/0",
    "files": ["src/billing/invoice.ts", "src/generated.ts", "src/lazy.ts", "src/legacy.cts", "src/orders.ts", "src/plugins.ts",
      "src/refunds.ts"]
  },
  "tool": { "name": "ts-morph snapshot project (TypeScript type checker)", "node": "v26.13.0", "tsMorph": "28.0.0",
    "typescript": "6.0.2", "modules": { "ts-morph/dist/ts-morph.js": "a86ac69a892c87c860e842c755543bd9600b9b13c26be44495cdcf4ef8fb7307" } },
  "virtualRoot": "/repo",
  "completeness": "partial",
  "declarations": [
    { "path": "src/billing/invoice.ts", "range": [{ "line": 1, "column": 1 }, { "line": 3, "column": 2 }] }
  ],
  "references": [
    { "path": "src/lazy.ts", "range": [{ "line": 2, "column": 11 }, { "line": 2, "column": 24 }],
      "kind": "value", "localName": "createInvoice" },
    { "path": "src/lazy.ts", "range": [{ "line": 3, "column": 10 }, { "line": 3, "column": 23 }],
      "kind": "call", "localName": "createInvoice" },
    { "path": "src/orders.ts", "range": [{ "line": 1, "column": 10 }, { "line": 1, "column": 23 }],
      "kind": "import", "localName": "createInvoice" },
    { "path": "src/orders.ts", "range": [{ "line": 4, "column": 10 }, { "line": 4, "column": 23 }],
      "kind": "call", "localName": "createInvoice" },
    { "path": "src/refunds.ts", "range": [{ "line": 1, "column": 10 }, { "line": 1, "column": 37 }],
      "kind": "import", "localName": "invoiceFor" },
    { "path": "src/refunds.ts", "range": [{ "line": 3, "column": 39 }, { "line": 3, "column": 49 }],
      "kind": "call", "localName": "invoiceFor" }
  ],
  "unresolved": [
    { "siteRef": "s4-001-file@source-sites.json#/sites/0", "path": "src/generated.ts", "lines": [1, 1],
      "kind": "re-export", "expression": "export * from './generated/billing';",
      "reason": "The compiler settings do not resolve this relative module name, so the query cannot tell whether it names the module of the symbol." },
    { "siteRef": "s4-001-file@source-sites.json#/sites/2", "path": "src/legacy.cts", "lines": [1, 1],
      "kind": "require-candidate", "expression": "require('./billing/invoice')",
      "reason": "TypeScript does not follow a require call in a TypeScript file. The call can load the module of the symbol." },
    { "siteRef": "s4-001-file@source-sites.json#/sites/4", "path": "src/plugins.ts", "lines": [2, 2],
      "kind": "dynamic-import", "expression": "import('./billing/' + name)",
      "reason": "The module name is computed. The query cannot tell which module the site names, so it can name the module of the symbol." }
  ],
  "gaps": [],
  "outsideReads": [
    { "operation": "directory-exists", "path": "/repo/src/generated" },
    { "operation": "directory-exists", "path": "/node_modules/typescript/lib" },
    { "operation": "directory-exists", "path": "/node_modules/typescript" },
    { "operation": "directory-exists", "path": "/node_modules" },
    { "operation": "file-exists", "path": "/package.json" }
  ],
  "notes": ["The references come from the TypeScript type checker of the snapshot project. ...", "..."]
}
```

The helper refuses a request and saves only a failed receipt when collect did
not complete or `source-sites.json` changed after it, when the path is not a
JavaScript or TypeScript file of the graph scope, when the file does not declare
or export the symbol, or when an export does not name a declaration in the
snapshot. Keep the failed receipt; request a corrected path or symbol in the same
attempt.

A reference shows that the code names the symbol. References do not prove all
calls, data flows or mutations, and they are not source inspections. Request
excerpts of the reference ranges and read them before a claim. The review can cite
the record, or one entry, as evidence, such as
`s4-001-file@references-001.json#/references/0`. Name each supplied record in
`suppliedArtifactRefs`. The publisher checks each references receipt as it checks
the excerpt receipts.

## 5. Ask the LLM to recover components

Give the LLM the saved `review-prompt.md`. In an interactive session, use:

```text
Review Choom Appendix A stage 4 for the prepared attempt.
Read its saved review-prompt.md and follow its evidence rules.
Verify the registered inputs and proposed artifact digests before analysis.
Use the stage 3 inspection priorities and the separate graph contexts.
Request additional numbered source excerpts when needed.
Request the references to a top-level symbol (a path and a symbol name) when
you need to know where it is used; then read the reference ranges.
Recover the apparent intended architecture; do not recommend redesigns.
Keep source-use assessments separate from allowedConsumers.
Review launch settings, behavior entries and each external operation's
registration or host binding. Use the candidate file mapping for the direct
owner of the start or handler. Keep unresolved paths and owners in discovery.
Use version 4 for systemEntryPoints, or the version required by the other
saved fields when there is no entry assessment.
Use one selected mapping and reviewed caller/binding evidence with partial scope.
Retain structured interface documentation. For each function or method entry
(`kind: function`), record a signature statement with its own
status and evidence references. Copy the supported declaration with parameters
and return type, without the body or opening brace. Do not invent types, void,
defaults or parameters, or derive types from prose. If the complete declaration
is unsupported, use a null signature and the exact discovery subject
interface-id.documentation.entries.entry-id.signature. Keep known interaction
facts separately. Omit signatures for other kinds. An absent signature means
not recorded; a null signature means unknown.
Prepare the proposed baseline and the supporting discovery records described
in step-4-cookbook.md. Keep the working drafts unchanged during review.
```

The LLM first explains representative behavior paths from inspected source. It
uses callers, tests, contracts, and documents to support the candidate groups.
It must distinguish a file entry from a behavior entry. Import references alone
do not establish a completed behavior path.

For each component, explain its purpose, proposed file membership, and grouping
reason. An API, worker, and command can belong to one component. A component can
span directories. Shared directory names and graph clusters are not sufficient
reasons for membership.
Shared contract links support a relationship, not exclusive file ownership.
A test can belong to its main workflow owner while exercising other components;
imports alone neither assign its owner nor prove isolation.

Prepare a complete review packet in a new folder outside `CHOOM_WORK`. Use the
exact filenames, shapes and reference rules in [record-format.md](record-format.md).
The following table explains their purpose:

| Proposed record | Required content |
| --- | --- |
| Baseline | Components, supported interfaces, resource owners, and intended rules. Statements use `{value, status: proposed, evidenceRefs}`. Unknown intent is `null` with a question or gap. |
| Code mapping | Explicit file scope, one direct component owner per file or `owner: null`, reasons, and supporting evidence. Exact mapped files belong here; membership selectors belong in the baseline. |
| Resource observations | Inspected access sites, access kind, target identity or explicit unknown target, context, and source evidence. Observed access does not establish permission. |
| Entry analysis update | Preserve entry history and Knip limits. Add supported behavior entries and references to the separate graph reachability results. |
| Discovery update | Overview, completed inspected paths, proposed fact references, questions, and gaps. `baselineRef` stays unset until the fixed baseline is saved in stage 6. |
| Review record | The prompt, the complete visible response, supplied evidence, exposed model metadata with `hiddenReasoning: not-saved`, and exact source ranges actually inspected. Do not save hidden reasoning. Do not invent unavailable API metadata. |

Keep the dependency facts from the graph separate from the proposed model.
Do not turn every observed import into an allowed-access rule. Keep intended
resource ownership separate from observed reads and writes. Do not invent
interface promises from names or type signatures alone.

Preserve the prior questions and gaps unchanged in this prototype. Append notes
that cite the earlier IDs when evidence resolves part of a gap. Keep conflicting
documents and code visible. Do not create a utilities component to absorb
unexplained files. Stage 5 accounts for remaining code.
Rewrite current summaries and limits to match the proposed packet; the historical
preservation rule does not apply to stale overview text or current counts.

If the review establishes a missing entry or a necessary Knip setting change,
record the affected scope. A new controlled Knip attempt must precede conclusions
that depend on the changed settings. Additional source inspection alone does not
require a rerun.

## 6. Check the proposed result

Apply the [review before publication](start-here.md#review-before-publication)
guidance before `finish`. Check the complete model and fact records:

- Every evidence reference resolves and matches its digest. Source ranges match
  saved numbered excerpts. Tool scans and references records are not recorded as
  LLM inspections.
- All inferred intent stays proposed. IDs are unique. Parent relationships have
  no cycles. Each mapped file has one direct owner or an explicit unknown owner.
- Membership selectors agree with the exact code mapping. Shared parent groups
  do not duplicate direct ownership.
- An inspected path cites the source that supports its entry, steps, and component
  references. Planned paths stay in the priorities, not in `inspectedPaths`.
- Reachability retains its context, roots, edge policy, stopped edges, and limits.
  No report difference or unreachable file is treated as proof of unused code.
- Resource observations and intended ownership remain separate. Unknown targets,
  missing dependencies, native-code coverage, and uninspected code remain visible.
- Current overview, mapping limits, resource limits and counts agree with the
  selected records. Do not carry an old limit forward merely because it was
  present in a previous packet. Review selected manifest summaries too; use the
  correction guidance for helper-owned prose rather than editing the manifest.
- The proposed draft updates are complete and consistent before any are written.

Use the shared trusted publisher after the review packet is ready. Its packet
schema is [record-format.md](record-format.md). The LLM supplies complete records;
the operator does not write a custom finalizer or classify source files.

```sh
export CHOOM_REVIEW="/absolute/path/to/stage-4-review"
node "$CHOOM_TOOLS/packages/producer/src/cli.ts" stage-4-5-publish check 4 "$CHOOM_REVIEW"
node "$CHOOM_TOOLS/packages/producer/src/cli.ts" stage-4-5-publish finish 4 "$CHOOM_REVIEW"
node "$CHOOM_TOOLS/packages/producer/src/cli.ts" stage-4-5-publish verify 4
```

Run each command separately. `check` validates the complete candidate without
publishing it. `finish` checks it again, preserves the review packet, registers
the attempt evidence, and publishes the working drafts. `verify` checks the
completed handoff. The producer code must match the run's record, and the record
format must match the copy that `start` saved. Do not edit the tool checkout or a
saved file to bypass a failed check, and do not run packet contents.

On success, `run.yaml` marks `componentRecovery: complete`. Discovery selects the
new entry analysis, mapping and resource observations plus the existing graph.
The baseline contains proposed statements. Keep this attempt unchanged and
continue to the [step 5 cookbook](step-5-cookbook.md).

## Saved state

| Point | `baseline.yaml` | `discovery.yaml` |
| --- | --- | --- |
| After `start` | Unchanged; empty on this initial pass. | Unchanged; still selects the finalized stage 3 entry analysis. |
| After `toolchain`, `run`, and `collect` | Unchanged. | Unchanged. New evidence exists in the stage 4 attempt but is not registered yet. |
| After the LLM review | Proposed model exists in separate review output. | Proposed mapping, access, entry, and path records exist in separate review output. |
| After `finish` and `verify` | Contains the supported proposed components and related intent. | Selects the new facts, overview, and inspected paths. `baselineRef` remains unset. |

Commands and receipts stay in this attempt. A failed action is not overwritten;
use a new attempt after correcting the cause. Keep successful stage 3 evidence
unchanged. Once stage 4 is published, keep all its registered artifacts unchanged
as well.
For a later correction, follow [start here](start-here.md#record-a-correction).
Do not repair a published artifact in place or rerun its finalizer.
