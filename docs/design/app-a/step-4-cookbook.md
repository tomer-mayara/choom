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
  - [Find the behavior entry candidates](#find-the-behavior-entry-candidates)
  - [Find the resource access candidates](#find-the-resource-access-candidates)
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
copies of this cookbook, the record format and the behavior entry rule list into
the new attempt, and refuses a rule list that does not follow its contract (see
[Find the behavior entry candidates](#find-the-behavior-entry-candidates)). It does
the same for the resource access rule list (see
[Find the resource access candidates](#find-the-resource-access-candidates)). Every later
command, the inspection helper and the publication commands in section 6 run from
the tool checkout and make the same producer code check first.
The input remains the empty version 1 seed. Versions 1 and 2 remain readable.
Use version 3 for [source-use assessments](record-format.md#version-3-source-use-assessments)
without a system-entry assessment. Use version 4 when a
[system-entry assessment](record-format.md#version-4-system-entry-points)
is present. Both formats retain version 2
[interface documentation](record-format.md#version-2-interface-documentation)
and signatures. Stage 4 maps whole files and does not write version 5: the
publisher refuses it. Stage 5 can divide a file by
[symbol selectors](record-format.md#version-5-symbol-selectors). When both
assessments are present, they must name the same snapshot and candidate mapping.
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
| `behavior-entry-candidates.json` | The candidates of the pinned behavior entry rules in the source files of the graph scope and in the `package.json` files of the snapshot: their rule, site, name, handler and role, the gaps, the scope and the limits. See [Find the behavior entry candidates](#find-the-behavior-entry-candidates). |
| `resource-access-candidates.json` | The candidates of the pinned resource access rules in the source files of the graph scope, and the resource call sites of `source-sites.json` that no rule found: their operation, name, confidence and source context, the scope and the limits. See [Find the resource access candidates](#find-the-resource-access-candidates). |
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
resource identity, or ownership. `resource-access-candidates.json` keeps each such
site that no resource access rule found. Mixed imports can contain type-only named
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

### Find the behavior entry candidates

`collect` applies the pinned list of Choom behavior entry rules to the source
files of the graph scope and saves the candidates in
`behavior-entry-candidates.json`. It also lists the files that the default patterns
of the Knip plugins in the Stage 2 profile select (see
[The candidates of the Knip plugin patterns](#the-candidates-of-the-knip-plugin-patterns)).
A behavior entry starts a path such as route → invoice creation → storage. A
candidate is a place to read: a syntax rule or a plugin pattern found it. It is not
a proven entry.

The list is `packages/producer/rules/behavior-entry-rules.yaml` in the tool
checkout, and its contract is
[behavior-entry-rules.tsp](../../../cookbook/interfaces/behavior-entry-rules.tsp).
The producer code record does not cover this file. So Stage 4 `start` checks the
list against the contract and refuses a list that does not follow it. It saves a
copy of the list as `behavior-entry-rules.yaml` and records its SHA-256 in
`handoff.json`, in `toolInputDigests`. Each later Stage 4 action (`toolchain`,
`run`, `collect`, `excerpt` and `references`) refuses a tool checkout whose list
differs from that copy, before it saves a receipt. Restore the list or start a new
attempt. A rule that changes keeps its ID and gets the next version.

The list holds the `http-route` rules of HTTP servers, the `worker-thread` and
`queue-worker` rules of workers and queues, the `frontend-entry` rules of Vite
settings, and the `cli-command` and `cli-bin` rules of command line tools, which
the tables below give. Each rule has an `id`, a `version`, the `library`, the
`entryKind` and one of three kinds:

- A `call` rule finds a call whose callee is its `callPath` on the value of its
  `importName`, a module name such as `express` or `node:worker_threads`. Write
  `callPath` as JavaScript that starts with a name that the import gives:
  `importName` itself for the value of the module (its default export, its
  `export =` value or what `require` gives), or else the name of an export of the
  module. Each `()` is a call and each `.name` a property, and the path ends with
  a name. With `new ` at the start, the first `()` is a `new` call, and a path with
  no `()` finds a `new` call of the path itself. So `express().get` finds
  `app.get(...)` after `const app = express()`, `Router().get` finds
  `router.get(...)` after `const router = Router()` or `express.Router()`, and
  `new Worker` finds `new Worker(...)`. `nameArgument` and `handlerArgument` give
  the zero-based positions of the name and of the handler, `last` for the last
  argument, or `null` for none. A call that does not have these arguments is not a
  candidate. For example, `app.get('title')` reads a setting of an Express app.

  Two optional fields serve chains of calls. `nameCall` names the call that holds
  the name, counted back from the call that the rule finds: `0`, the value without
  the field, for that call, `1` for the last call of the call path, such as the
  command call of `program.command('serve').action(serve)` for
  `program.command().action`, and `2` for the call before it. `sameValueMethods`
  lists the methods whose call gives the value that it is called on, such as the
  builder methods of a command. The rule passes the calls of these methods
  anywhere in the chain: `program.command().action` with `description` also finds
  `program.command('serve').description('Start the server').action(serve)`. The
  check refuses a name call that the call path does not have or that names no
  name argument, and a call path that calls one of its `sameValueMethods`, because
  such a rule finds no call.
- A `settings-literal` rule reads the literal value at its `propertyPath`, such as
  `build.rollupOptions.input`, in the settings object of a file of the scope that
  matches its `fileGlob`, such as `**/vite.config.{js,mjs,cjs,ts,mts,cts}`.
- A `package-bin` rule has no other fields. It reads the `bin` field of each
  `package.json` of the snapshot.

The `http-route` rules find the route methods of four kinds of server values.
Each rule finds one method. The path is the name (`nameArgument: 0`) and the last
argument is the handler (`handlerArgument: last`):

| Server value | `importName`, `callPath` | Methods | Rule IDs |
| --- | --- | --- | --- |
| An Express app, such as `const app = express()` | `express`, `express().<method>` | `get`, `post`, `put`, `patch`, `delete`, `options`, `head`, `all` | `express-route-<method>` |
| An Express router: `express.Router()`, or `Router()` after `import { Router } from 'express'` | `express`, `Router().<method>` | The same eight methods | `express-router-<method>` |
| A Fastify server: `Fastify()` after `import Fastify from 'fastify'`, or `require('fastify')()` | `fastify`, `fastify().<method>` | The same eight methods | `fastify-route-<method>` |
| A Hono app, such as `const app = new Hono()` after `import { Hono } from 'hono'` | `hono`, `new Hono().<method>` | `get`, `post`, `put`, `patch`, `delete`, `options`, `all`. Hono has no `head` method: a `get` route also answers `HEAD`. | `hono-route-<method>` |

A route candidate names its method through its rule. `ruleId` names the rule, and
the `callPath` of that rule in the saved copy of the list ends with the method,
such as `fastify().post` for `fastify-route-post`. The record has no method field.
`name` is the path as the call writes it. `handler` is the last argument, so route
options before the handler, as in `fastify.put('/orders/:id', opts, updateOrder)`,
and the earlier handlers of a route with several handlers do not change it.

The `worker-thread` and `queue-worker` rules find the `new Worker(...)` calls that
start a worker. A rule finds the calls of one module name, so `node:worker_threads`
and `worker_threads` each have a rule:

| Worker | `importName`, `callPath` | `entryKind` | Name and handler | Rule ID |
| --- | --- | --- | --- | --- |
| A worker thread, such as `new Worker('./worker.js', { workerData })` after `import { Worker } from 'node:worker_threads'` | `node:worker_threads`, `new Worker` | `worker-thread` | The worker file is the name (`nameArgument: 0`). The call has no handler (`handlerArgument: null`): the worker runs its file. | `node-worker-threads-worker` |
| A worker thread after an import or a `require` of `worker_threads`, such as `const { Worker } = require('worker_threads')` | `worker_threads`, `new Worker` | `worker-thread` | The same | `worker-threads-worker` |
| A BullMQ queue worker, such as `new Worker('foo', async job => { ... }, { connection })` after `import { Worker } from 'bullmq'` | `bullmq`, `new Worker` | `queue-worker` | The queue name is the name (`nameArgument: 0`) and the processor is the handler (`handlerArgument: 1`). Options can follow the processor, so the handler is not the last argument. | `bullmq-worker` |

A worker candidate names the start site of the worker: its `range` and
`expression` are the `new Worker(...)` call. `name` is the worker file or the queue
name, as the call writes it. A worker thread runs its file, so its candidate has
`handler: null`, with the `handlerReason` that the rule names no handler argument.
The rules do not resolve a worker file to a snapshot file. Node.js resolves a
relative path, such as `./worker.js`, from the working directory of the process,
not from the file that starts the worker.

The `frontend-entry` rules are `settings-literal` rules. They read the entries that
a Vite settings file names: `vite.config` with the extension `js`, `mjs`, `cjs`,
`ts`, `mts` or `cts`, the names that Vite looks for, in any folder of the scope
(`fileGlob: '**/vite.config.{js,mjs,cjs,ts,mts,cts}'`). Each rule reads one
property. Its value is a path, an array of paths or an object whose property values
are paths:

| Setting | `propertyPath` | Rule ID |
| --- | --- | --- |
| The input of the build in the Rollup options, such as `build: { rollupOptions: { input: { main: 'index.html', nested: 'nested/index.html' } } }`. Vite 8 renames these options `rolldownOptions` and keeps `rollupOptions` as an alias. | `build.rollupOptions.input` | `vite-build-rollup-options-input` |
| The input of the build in the Rolldown options of Vite 8, such as `build: { rolldownOptions: { input: ['index.html', 'nested/index.html'] } }` | `build.rolldownOptions.input` | `vite-build-rolldown-options-input` |
| The top-level input of Vite 8, such as `input: { main: 'index.html' }`. Vite also uses it in development, and an input of the build options replaces it for the build. | `input` | `vite-input` |
| The entry of a library that Vite builds in library mode, such as `build: { lib: { entry: 'lib/main.js', name: 'MyLib' } }` | `build.lib.entry` | `vite-build-lib-entry` |

A settings candidate names the settings file and an entry: its `path` is the
settings file, its `range` and `expression` are the string literal, and `name` is
the text of the literal, such as `index.html`. A settings entry has no handler, so
the candidate has `handler: null`, with a `handlerReason`. Each value that is not a
string literal, such as `resolve(import.meta.dirname, 'nested/index.html')`, is a
gap of kind `unknown-settings-value` at that value, with a reason. The rules do not
resolve a name to a snapshot file. Vite resolves a relative path from the project
root or from the folder where the build runs, so read the settings file and the
build command before you map a name to a file.

The `cli-command` rules find the commands of command line programs. Each rule
finds the commands of one kind of program:

| Program | `importName`, `callPath` | Name, handler and same value methods | Rule ID |
| --- | --- | --- | --- |
| A commander program on the program export, such as `program.command('clone <source> [destination]').description('...').action(clone)` after `import { program } from 'commander'` | `commander`, `program.command().action` | The rule finds the action call. The name is the first argument of the command call (`nameCall: 1`, `nameArgument: 0`), and the action is the handler (`handlerArgument: 0`). `sameValueMethods` lists the 40 methods of `Command` that have a form that returns the command itself, as the typings of commander 15 declare them, except `action`, `command` and `parse`. | `commander-program-command` |
| A commander program that `new Command()` makes, such as `const program = new Command()` after `import { Command } from 'commander'` | `commander`, `new Command().command().action` | The same | `commander-class-command` |
| A yargs program, such as `yargs(hideBin(process.argv)).command('serve [port]', 'start the server', builder, handler)` after `import yargs from 'yargs'` | `yargs`, `yargs().command` | The name is the first argument (`nameArgument: 0`), and argument 3 is the handler (`handlerArgument: 3`), as the yargs documentation writes `.command(cmd, desc, builder, handler)`; middlewares can follow it. `sameValueMethods` lists the 65 methods of a yargs instance that return the instance in yargs 18, `command` among them, so each command call of one chain is a candidate. | `yargs-command` |

A command candidate names its command and its action. `name` is the first argument
of the command call as the call writes it, with the arguments of the command, such
as `clone <source> [destination]` or `serve [port]`; the command name is its first
word. `handler` is the action. The `range` and `expression` of a commander candidate
are the action call, from the start of its chain, such as `program` or
`program.command('split')`. Those of a yargs candidate are its command call, from
the start of its chain, so the call of a later command holds the earlier commands
of the chain. The candidates of one chain are in the order of the chain.

The `cli-bin` rule has the ID `package-bin` and the kind `package-bin`. It
reads the `bin` field of each `package.json` of the inventory outside the
`node_modules` folders, as JSON text; nothing runs. The field is one path, for the
command of the package name, or an object whose keys are command names and whose
values are paths, such as `"bin": { "myapp": "bin/cli.js" }`. Each path is a
candidate:

- `path` is the `package.json`, and `range` and `expression` are the value, such as
  `"bin/cli.js"` with its quotes.
- `name` is the command as npm installs it: the key, or the package name for one
  path, without folders or a scope, such as `tools` for the package `@acme/tools`.
  When the field is one path and the package has no name, `name` is `null` with
  `nameReason`.
- `handler` is the whole file that the command runs, from line 1, column 1 to the
  end of the file, only with evidence. npm resolves the path in the folder of the
  package and keeps a path that leaves the folder in it, and so do the rules.
  `handler.evidence` names the evidence:
  - `snapshot-file`: the snapshot holds the bin file. `binFile` is its path, which
    is the path of the handler.
  - `compiler-output`: a fully parsed configuration of the settings record
    (`settings-001`) compiles a source file of the snapshot to the bin file.
    `compilerSettingsRef` names the configuration, such as
    `settings-001#/configs/0`. The bin file is in its `outDir`, and the source file
    has the same path in its `rootDir`, with a source extension of the extension of
    the bin file: `.ts`, `.tsx`, `.js` or `.jsx` for `.js`, `.tsx` or `.jsx` for
    `.jsx`, `.mts` or `.mjs` for `.mjs`, and `.cts` or `.cjs` for `.cjs`. The
    configuration selects the source file. `binFile`, `outDir` and `rootDir` are
    snapshot paths, with `.` for the root.
- Otherwise `handler` is `null` with `handlerReason`, such as for `./build/server.js`
  when no saved configuration with `outDir` and `rootDir` compiles a source file to
  it. A bin file that is not UTF-8 text gives no range, so its `handler` is `null`
  too.

| Rule | `kind` | Candidate | Rule ID |
| --- | --- | --- | --- |
| The commands of the `bin` field of a `package.json` | `package-bin` | `entryKind: cli-bin`, the command name, the range of the value, and the file that the command runs with its evidence, or `null` with a reason | `package-bin` |

With `"outDir": "dist"` and `"rootDir": "src"` in `tsconfig.json`, the command
`"string-util": "./dist/string-util.js"` gives this candidate; the digest is cut:

```json
{ "ruleId": "package-bin", "ruleVersion": 1, "entryKind": "cli-bin", "found": "syntax-rule", "role": "unknown",
  "roleRef": null, "path": "package.json", "sha256": "...",
  "range": [{ "line": 7, "column": 20 }, { "line": 7, "column": 43 }], "expression": "\"./dist/string-util.js\"",
  "truncated": false, "name": "string-util", "nameReason": null,
  "handler": { "path": "src/string-util.ts", "range": [{ "line": 1, "column": 1 }, { "line": 9, "column": 1 }],
    "evidence": { "kind": "compiler-output", "binFile": "dist/string-util.js",
      "compilerSettingsRef": "settings-001#/configs/0", "outDir": "dist", "rootDir": "src" } },
  "handlerReason": null }
```

Each other value of the field, such as a number or an array, is a gap of kind
`unknown-settings-value` at that value, with a reason. A `package.json` whose value
is not a JSON object is a gap at that value, and one that is not valid JSON is a gap
at the whole file. A `package.json` that is not UTF-8 text
gives no candidate and no gap, because a gap needs a range in the saved text; the
settings record reads each `package.json`.

The helper reads each file of the scope in the snapshot project of its graph
group, with the compiler settings of the group, chosen as for the references
action, and with `allowJs`. For a `call` rule, the type checker follows each local
name back to the import:

- default, named, renamed and namespace imports, `import =` and `require`;
- a variable that holds a value of the import or a part of it, such as
  `const app = express()` or `const { Router } = express`;
- the imports and the exports of other snapshot files, such as
  `import { app } from './app'`.

A call with the same method name on another receiver, such as `cache.get(...)` on
a `Map`, is not a candidate. The default export, a namespace import and `require`
of a module are one value, as they are for a CommonJS package. For each candidate:

- `name` is the text of a string literal or of a template literal without
  substitutions. Any other name is `null`, with `nameReason`.
- `handler` is a function in the call, with its own range, or the declaration
  that a handler name names after its aliases, as the references action follows
  them. Its `path` can be another file. Otherwise `handler` is `null`, with
  `handlerReason`: for example a parameter, the result of a call such as
  `asyncHandler(listOrders)`, or an import of a package.
- `role` is `test` when a role record of the Stage 1 review (`review-001`) whose
  roles include `tests` has a selector that is the exact path of the file or a
  folder that holds it. The Stage 1 cookbook asks for exact file and directory
  selectors and names this role `tests`, so a glob selector, a selector such as
  `./test`, and another role name such as `test` give no test role. `roleRef`
  names the first such record. Otherwise `role` is `unknown`: the rules do not
  show whether the code is application or tooling code.

A `settings-literal` rule reads the value of `export default`, `export =` or the
last `module.exports =` of the file, through a call with one argument, such as
`defineConfig({ ... })`, and through the `const` declarations of the file. Each
string literal at the end of `propertyPath`, in an array there, or as a property
value of an object there, is a candidate with no handler. Each other value is a gap
of kind `unknown-settings-value`, with its site and a reason. Nothing runs the file.

The helper does not find these entries, and the record has no entry for them, so
a missing candidate does not show that the code has no entry:

- a call on a value that a function gets as a parameter, such as
  `function routes(app) { app.get(...) }`;
- a value that a later assignment gives;
- a value that a function returns, such as `app` after `const app = createApp()`;
- a call on the result of another call, such as
  `app.get('/a', list).post('/b', create)`, unless the rule lists the method of
  that call in its `sameValueMethods`;
- the files outside the graph scope, and source that is not JavaScript or
  TypeScript, except the `package.json` files that the `package-bin` rule reads.

The `http-route` rules also do not find these routes:

- Express `use`, such as `app.use('/birds', birds)`: it adds middleware or a
  router, not a route.
- The routes of `app.route('/book')` and `router.route('/book')`, such as
  `app.route('/book').get(...)`.
- Fastify `route({ method, url, handler })` and Hono `on('PURGE', '/cache', ...)`:
  the method is an argument, not the name of the call.
- A route on the app that another call of the app gives, such as
  `new Hono().basePath('/api').get(...)`.
- A Hono route without a path, such as `app.post(create)`.
- A route on a function parameter, such as a Fastify plugin
  `async function routes(fastify) { fastify.get(...) }` that
  `fastify.register(routes)` adds, or `function routes(app) { ... }` that
  `routes(app)` calls.
- A method that the table does not name, such as Express `trace`.
- The export `fastify` of the module `fastify`, as in
  `import { fastify } from 'fastify'`: a `callPath` that starts with the import
  name names the value of the module, so no rule can name this export.
- An app of the Hono presets `hono/tiny` and `hono/quick`: they are other module
  names.

The name is the path in the call. It does not include a path that another call
adds, such as `/birds` from `app.use('/birds', birds)` in Express or `/book` from
`app.route('/book', book)` in Hono. When a Fastify route has its handler in its
options object, such as `fastify.get('/', { schema, handler })`, `handler` is
`null` with a reason, or the declaration of the options object when the last
argument is its name.

The worker and queue rules also do not find, or do not name, these workers:

- A worker file that is not a string literal, such as `__filename`,
  `new URL('./worker.js', import.meta.url)` or `path.join(__dirname, 'worker.js')`:
  `name` is `null` with `nameReason`. The examples of the Node.js documentation
  use `__filename` and `new URL(import.meta.url)`.
- A worker thread with the option `eval: true`: the first argument is JavaScript
  code, so `name` is that code, not a file.
- A BullMQ sandboxed processor: the processor is the path of a file that BullMQ
  runs in another process, not a function. A path as a string literal, such as
  `new Worker('foo', './processor.js')`, and a URL that the call makes, such as
  `pathToFileURL(file)`, give `handler: null` with a reason. A name, such as
  `processorFile` after
  `const processorFile = path.join(__dirname, 'my_processor.js')` as the BullMQ
  guide writes it, gives the declaration of that variable as the handler. Read it
  to find the processor file.
- A BullMQ worker without a processor argument, such as `new Worker('my-queue')`
  for jobs that the code fetches itself: the call does not have the handler
  argument that the rule names, so it is not a candidate. A `null` processor gives
  `handler: null` with a reason.
- Web Workers: the `Worker` global of browser code, such as
  `new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })` with no
  import. The rules find only the `Worker` class of an import of
  `node:worker_threads`, `worker_threads` or `bullmq`.
- A child process of `child_process.fork`, such as `fork('./child.js')`, and a
  worker process of `cluster.fork()`: the list has no rule for processes.
- The workers of other queue libraries, such as `queue.process(...)` of Bull, and
  the `Worker` class of another package.

The `frontend-entry` rules also do not find, or do not name, these entries:

- The default entry. When no setting names an input, Vite builds `index.html` in
  the project root: the folder where the `vite` command runs, or the folder that
  the `root` setting names. The rules give no candidate and no gap for it, so look
  for that file in the snapshot.
- The modules that an HTML entry loads, such as `/src/main.ts` in
  `<script type="module" src="/src/main.ts">` of `index.html`. The rules do not read
  HTML. Read each page that a candidate or the default entry names.
- An entry that the code computes is a gap, not a candidate. The examples of the
  Vite guide compute each entry, such as
  `resolve(import.meta.dirname, 'nested/index.html')`, so their entries are gaps.
- Settings that a function makes, such as the conditional config
  `defineConfig(({ command, mode }) => { ... })` or an async function, and settings
  that a call with more than one argument makes, such as
  `mergeConfig(base, { ... })`: each rule gives a gap at that value, with a reason,
  and no candidate.
- `lib: false`, which turns library mode off: the library entry rule gives a gap,
  because the value on its path is not an object literal.
- `build.ssr`. As a string, it names the entry of an SSR build, such as
  `ssr: 'src/entry-server.js'`; as `true`, the input is the SSR entry. A rule for it
  would record `true` as a gap with the reason of a value that is known only at run
  time, so the list has no rule for it. The `--ssr` option of the command, such as
  `vite build --ssr src/entry-server.js`, is not in the settings file either.
- The settings of an environment, such as
  `environments.ssr.build.rolldownOptions.input`: a `propertyPath` has fixed names,
  and an environment can have any name.
- A settings file with another name, which only the `--config` option of the
  `vite` command names, such as `vite.config.production.ts`; the settings of Vitest
  in `vitest.config.*`; and an input that a Vite plugin adds.

The list has no rule for Next.js. Next.js finds its entries from its folders, not
from a setting: the special files of the `app` folder, such as `page.tsx` and
`route.ts`, the files of the `pages` folder, both also under `src`, and files such
as `proxy.ts` (formerly `middleware.ts`) and `instrumentation.ts`. No property of
`next.config.*` names entry files as literal values: `pageExtensions` names file
extensions, and `exportPathMap` and `webpack` are functions. So a
`settings-literal` rule cannot find these entries. The Next.js plugin of Knip 6.44.1
has default patterns for these files, and the Stage 2 profile copies them, so each
such file of a workspace that depends on `next` is a `knip-plugin-pattern` candidate.

The `cli-command` rules also do not find, or do not name, these commands:

- A nested command, such as `program.command('brew').command('tea').action(...)`: a
  command call makes a new command, so `command` is not a same value method of the
  commander rules. A command of a `new Command('brew')`, such as
  `brew.command('tea').action(...)`, is a candidate of `commander-class-command`.
- The action of the program itself, such as `program.argument('<name>').action(...)`
  without a command call, and the action of a command that the code makes with
  `new Command('build')` or `createCommand('build')` and adds with `addCommand`,
  such as `new Command('build').action(...)`.
- A stand-alone executable command, such as
  `program.command('start <service>', 'start named service')`: it has no action, and
  commander runs the file `<program>-start`. A command call with a description gives
  the program, not the new command, so an action call after it is the action of the
  program. The rules do not see the description, so such an action call is a
  candidate with the name of the command.
- The default export of commander before version 7, such as
  `const program = require('commander')`, the yargs singleton, such as
  `require('yargs').command(...)`, which yargs 18 no longer has, and the module name
  `yargs/yargs`: a rule finds the calls of one module name.
- A yargs command module, such as `.command(serveModule)` or
  `.command(require('./commands/serve'))`: the call has no handler argument after the
  name, so it is not a candidate. Read the module: its `command` property is the
  name and its `handler` property is the handler. The command modules of a folder
  that `commandDir('commands')` loads are not candidates either.
- A yargs command without a handler argument, such as `.command(cmd, desc)` or
  `.command(cmd, desc, builder)`, is not a candidate.
- A command that a builder function adds on its parameter, such as
  `(yargs) => yargs.command('add <name>', ...)`, and a command call of a chain after
  a method that `sameValueMethods` does not list, such as a method of a later
  version of the library.

The `cli-bin` rule also does not find, or does not name, these commands and files:

- The commands of a folder, such as `"directories": { "bin": "./bin" }`, which npm
  reads only without a `bin` field, and the scripts of the `scripts` field.
- The `bin` field of a `package.json` in a `node_modules` folder.
- The source of a bin file that another build tool makes, such as an esbuild,
  tsup or Rollup bundle, or that a configuration without `rootDir` makes:
  TypeScript then takes a folder that it computes, and the settings record does not
  save it. A configuration with `outFile` puts all the output in one file. Read the
  build settings and the build command.
- A bin file that npm cannot run: the rule does not check that the file starts with
  `#!/usr/bin/env node`, that it runs, or that npm installs the package.

#### The candidates of the Knip plugin patterns

Stage 2 keeps every Knip plugin turned off, so Knip loads no settings file. In place
of the plugins, its profile copies the default entry patterns of the Knip 6.44.1
plugins that the dependencies of a workspace manifest turn on, and records each
copied pattern in `pluginEntryPatterns` of its `preflight.json` (see the
[Stage 2 cookbook](step-2-cookbook.md#knip-plugin-patterns)). Knip's report lists
issues, not entries, so `collect` finds the files of these patterns itself. It reads
the preflight record that the Knip receipts of the selected entry analysis name
(`knipRunsRef`, then `preflightRef`), and the workspaces of the Knip profile
(`profileRef`). Each indexed regular file that a copied pattern selects is a
candidate with `found: knip-plugin-pattern`:

- The pattern matches the path in the folder of its workspace, with picomatch and dot
  files, as Knip globs, and without the final `!` of a production pattern. A file of
  another workspace of the profile inside that folder is left to the patterns of that
  workspace. A workspace that only Knip finds, from the `workspaces` field of a
  manifest, is not known, so its files can match a pattern of an outer workspace.
- `workspace`, `manifest`, `plugin`, `dependency`, `field` and `pattern` are the
  source of the pattern, and `patternRef` names it, such as
  `s2-001-preflight#/pluginEntryPatterns/6`. `role` and `roleRef` follow the role rule
  of the syntax-rule candidates. The candidate has no range, name or handler: the
  file is the entry.
- The candidates come after the syntax-rule candidates, by the order of the copied
  patterns and then of the paths, and the limit of 10000 candidates applies to all of
  them. A file that a settings rule and a plugin pattern both find is listed for each,
  with its own source.

A plugin pattern is a default of Knip 6.44.1 and shows only a framework convention:
a settings file can change it, and the profile does not read settings files. Knip
may not read a selected file, such as a `.vue` file without the Vue plugin. An entry
that only a settings file names, such as a Vite input, is a syntax-rule candidate of
the settings rules or a gap. The files of the patterns are candidates, not roots of
the Stage 4 graph, which come from the entry patterns of the plan. For a Next.js app,
the page `app/page.tsx` gives:

```json
{ "found": "knip-plugin-pattern", "role": "unknown", "roleRef": null, "path": "app/page.tsx",
  "sha256": "b2f6ca49f1602dfbea9399a853dda8334cbf2026f6e1a3356f26ae699bcd42af",
  "workspace": ".", "manifest": "package.json", "plugin": "next", "dependency": "next", "field": "production",
  "pattern": "{,src/}app/**/{layout,page,route,template}.{js,jsx,ts,tsx}!",
  "patternRef": "s2-001-preflight#/pluginEntryPatterns/6" }
```

| Record field | Meaning |
| --- | --- |
| `formatVersion`, `attemptId`, `snapshotRef`, `status` | `1`, the Stage 4 attempt ID, the snapshot ID, and `completed`, or `partial` when the limit of 10000 candidates omitted some. |
| `rulesRef`, `rulesSha256` | The copy of the rule list that start saved, and its SHA-256. |
| `settingsRef`, `rolesRef` | `settings-001`, whose compiler settings the helper used, and `review-001`, whose role records give the roles. |
| `scope` | `files`, the source files of the graph scope; and `groups`, for each graph group, its import pass (`graphContext` and `graphContextRef`), its `compilerSettingsRef` and the files that it read. The `package.json` files that the `package-bin` rule reads are not in `scope`. |
| `queryOptions`, `tool`, `virtualRoot` | As in the references record. `tool` also names the picomatch version that matched the `fileGlob` of the settings-literal rules and the Knip plugin patterns. |
| `candidates` | Each candidate, in the order of the scope files and then in source order, then the candidates of the `package-bin` rule in the order of the inventory: `ruleId`, `ruleVersion`, `entryKind`, `found` (`syntax-rule`), `role`, `roleRef`, `path`, `sha256`, `range`, `expression`, `truncated`, `name`, `nameReason`, `handler` (`path` and `range`, and also `evidence` for a `package-bin` candidate, or `null`) and `handlerReason`. Then each file of a Knip plugin pattern, by the order of the copied patterns and then of the paths: `found` (`knip-plugin-pattern`), `role`, `roleRef`, `path`, `sha256`, `workspace`, `manifest`, `plugin`, `dependency`, `field`, `pattern` and `patternRef`. |
| `omittedCandidates` | The number of candidates after the limit. |
| `gaps` | Each value of a `settings-literal` rule that is not a literal, and each value of the `package-bin` rule that is not a path, located like a candidate, with `reason`; and each compiler input that the snapshot does not hold, as in the references record. |
| `outsideReads`, `notes` | As in the references record. |

A range has 1-based lines and columns, as in the references record. `expression`
holds at most 4096 code units, and `truncated` is `true` when the site is longer.
A small snapshot with a route file and a test file gives this record. The snapshot
ID is an example, and the tool digests, `outsideReads` and `notes` are cut:

```json
{
  "formatVersion": 1,
  "attemptId": "s4-001",
  "snapshotRef": "snapshot-001",
  "status": "completed",
  "rulesRef": "s4-001-file@behavior-entry-rules.yaml",
  "rulesSha256": "48bcfe0262d65477f65ff2a2954af2d548fa8b032a76b9337becb83752522f6a",
  "settingsRef": "settings-001",
  "rolesRef": "review-001",
  "scope": {
    "files": ["src/orders.ts", "src/server.ts", "test/routes.test.ts"],
    "groups": [{ "graphContext": "choom-default-v1-import", "graphContextRef": "s4-001-file@graph-profile.json#/contexts/0",
      "compilerSettingsRef": "settings-001#/parsingProfile", "files": ["src/orders.ts", "src/server.ts", "test/routes.test.ts"] }]
  },
  "queryOptions": { "allowJs": true },
  "tool": { "name": "ts-morph snapshot project (TypeScript type checker)", "node": "v26.13.0", "tsMorph": "28.0.0",
    "typescript": "6.0.2", "modules": { "ts-morph/dist/ts-morph.js": "..." }, "picomatch": "4.0.7" },
  "virtualRoot": "/repo",
  "candidates": [
    { "ruleId": "express-route-get", "ruleVersion": 1, "entryKind": "http-route", "found": "syntax-rule",
      "role": "unknown", "roleRef": null, "path": "src/server.ts",
      "sha256": "be5271009e2bf18c99451e75f668079e83aeb47e12eff9cb6d037b1583eff0cd",
      "range": [{ "line": 6, "column": 1 }, { "line": 6, "column": 31 }],
      "expression": "app.get('/orders', listOrders)", "truncated": false, "name": "/orders", "nameReason": null,
      "handler": { "path": "src/orders.ts", "range": [{ "line": 1, "column": 1 }, { "line": 3, "column": 2 }] },
      "handlerReason": null },
    { "ruleId": "express-route-get", "ruleVersion": 1, "entryKind": "http-route", "found": "syntax-rule",
      "role": "unknown", "roleRef": null, "path": "src/server.ts",
      "sha256": "be5271009e2bf18c99451e75f668079e83aeb47e12eff9cb6d037b1583eff0cd",
      "range": [{ "line": 7, "column": 1 }, { "line": 7, "column": 55 }],
      "expression": "app.get('/' + resource, (request: unknown) => request)", "truncated": false, "name": null,
      "nameReason": "The name argument is not a string literal, so the name is known only at run time.",
      "handler": { "path": "src/server.ts", "range": [{ "line": 7, "column": 25 }, { "line": 7, "column": 54 }] },
      "handlerReason": null },
    { "ruleId": "express-route-get", "ruleVersion": 1, "entryKind": "http-route", "found": "syntax-rule",
      "role": "test", "roleRef": "review-001#/roles/0", "path": "test/routes.test.ts",
      "sha256": "aadf4a92204785b5926e2f3e9e245a864e69344ac1087091a86ad4df5d1c6afa",
      "range": [{ "line": 3, "column": 1 }, { "line": 3, "column": 31 }],
      "expression": "app.get('/health', () => 'ok')", "truncated": false, "name": "/health", "nameReason": null,
      "handler": { "path": "test/routes.test.ts", "range": [{ "line": 3, "column": 20 }, { "line": 3, "column": 30 }] },
      "handlerReason": null }
  ],
  "omittedCandidates": 0,
  "gaps": [],
  "outsideReads": ["..."],
  "notes": ["A candidate is a call, a settings entry or a bin command that a Choom syntax rule found (found: syntax-rule), or a file that a Knip plugin pattern of the Stage 2 profile selects (found: knip-plugin-pattern). ...", "..."]
}
```

Read the site and the handler of a candidate before a claim. The review can cite
the record, or one candidate, as evidence, such as
`s4-001-file@behavior-entry-candidates.json#/candidates/0`, and the Stage 4 entry
analysis names the record as `behaviorEntryCandidatesRef` (see the
[record format](record-format.md#behavior-entry-candidates)). The publisher checks
each candidate and gap against the saved snapshot.

### Find the resource access candidates

`collect` also applies the pinned list of Choom resource access rules to the source
files of the graph scope and saves the candidates in `resource-access-candidates.json`.
A candidate is a site to read. It shows observed access syntax: a call, its operation
and the name of a resource. It does not show which resource the call uses, and it
names no owner. Two sites with the same table name need not use the same table, so
the identity of a resource is inferred from its name and is not proven.

The list is `packages/producer/rules/resource-access-rules.yaml` in the tool
checkout, and its contract is
[resource-access-rules.tsp](../../../cookbook/interfaces/resource-access-rules.tsp).
Stage 4 `start` checks it, saves a copy as `resource-access-rules.yaml` and records
its SHA-256 in `toolInputDigests`, and each later Stage 4 action refuses a tool
checkout whose list differs from that copy, as for the behavior entry rule list. A
rule that changes keeps its ID and gets the next version.

The list holds four rules now, for the table queries of Knex, such as
`db('invoices').insert(row)`: `knex-insert`, `knex-update` and `knex-del` with the
operation `write`, and `knex-select` with the operation `read`. Knex names the table
in the call that starts the query and the operation in the method after it, so a rule
can read both without SQL text. Each rule has an `id`, a `version`, the `library`, the
`resourceKind`, such as `database-table`, the `operation`, such as `read` or `write`,
and:

- `importName` and `callPath`, as in a `call` rule of the behavior entry rules. The
  rule finds a call whose callee is `callPath` on the value of the import, such as
  `knex()().insert` for `db('invoices').insert(row)` after `const db = knex(config)`.
  Such a candidate has `confidence: receiver-import`.
- `typePath`, or `null`: the same call written from a type that the import exports,
  such as `Knex().insert`. The rule also finds the call on a value whose declared
  type is that type, with `confidence: receiver-type`: a parameter such as
  `db: Knex`, a parameter property such as `constructor(private readonly db: Knex)`,
  a class or interface property, or a variable with a type annotation. The snapshot
  holds no package types, so the type checker cannot read the type itself. The
  helper follows the type reference to its import binding, as it follows a value:
  through the imports and exports of snapshot files, the type aliases of the
  snapshot, a qualified name such as `knex.Knex`, and a union with `null` or
  `undefined`. A type path ends with the last steps of the call path, and the type
  stands for the value of the steps before them: `Knex` stands for `knex()`.
- `nameCall` and `nameArgument`: the name of the resource is the argument at
  `nameArgument` of the call at `nameCall`, counted back from the call that the rule
  finds: `0` for that call and `1` for the last call of the call path. The Knex rules
  read the table name from `db('invoices')`, with `nameCall: 1` and
  `nameArgument: 0`. That call can also be in the initializer of a variable that holds
  the query, as the value follows it.

A call of the same method on another receiver, such as `cache.insert(row)`, is not a
candidate of a rule. For each candidate:

- `name` is the text of a string literal or of a template literal without
  substitutions. Any other name is `null`, with `nameReason`. `identity` is
  `inferred-from-name` when the candidate has a name, and `unknown` otherwise.
- `context` is what the source shows, not a runtime trace: the function or the method
  that holds the call (`kind: function` or `method`), with its name and range, or the
  module (`kind: module`), when no function holds it, such as a call at the top level
  or in a class field outside any function. A member of a named class has the class
  name first, such as `InvoiceService.create`. `graphContext` names the import pass
  of the graph group of the file, as in `scope.groups`.
- `siteRef` names the site of `source-sites.json` when the call is a resource call
  site there, else `null`.

Each resource call site of `source-sites.json` that no rule found stays in the record
as a candidate with `confidence: name-only` and its `siteRef`. It has no rule,
operation or name, and its identity is `unknown`: only its method name is on the list
of the source collection. The source sites do not change.

The rules do not find these accesses, so a missing candidate does not show that the
code has no access:

- a chain with another call between the table call and the method, such as
  `db('invoices').where({ id }).update(row)`;
- a named import whose name is the import name, such as `import { knex } from 'knex'`:
  a call path that starts with `knex` names the value of the module;
- a member of a namespace import of a snapshot file, such as `database.db('invoices')`
  after `import * as database from './db'`, as for the behavior entry rules;
- a value without a declared type, a value that a later assignment gives, the return
  type of a function or a method, and a union of two types;
- a table name in SQL text: the rules do not read SQL strings;
- the files outside the graph scope, and source that is not JavaScript or TypeScript.

| Record field | Meaning |
| --- | --- |
| `formatVersion`, `attemptId`, `snapshotRef`, `status` | `1`, the Stage 4 attempt ID, the snapshot ID, and `completed`, or `partial` when the limit of 10000 candidates omitted some. |
| `rulesRef`, `rulesSha256` | The copy of the rule list that start saved, and its SHA-256. |
| `settingsRef`, `sourceSitesRef` | `settings-001`, whose compiler settings the helper used, and the `source-sites.json` of collect, whose resource call sites the record keeps. |
| `scope`, `queryOptions`, `tool`, `virtualRoot` | As in the behavior entry candidates record. `tool` names no picomatch version. |
| `candidates` | Each candidate, in the order of the scope files and then in source order: `ruleId`, `ruleVersion`, `library`, `resourceKind`, `operation` (each `null` for a name-only candidate), `confidence` (`receiver-import`, `receiver-type` or `name-only`), `siteRef`, `path`, `sha256`, `range`, `expression`, `truncated`, `name`, `nameReason`, `identity` (`inferred-from-name` or `unknown`) and `context` (`kind`, `name`, `range` and `graphContext`). No field names an owner. |
| `omittedCandidates` | The number of candidates after the limit. |
| `gaps` | Each compiler input that the snapshot does not hold, as in the references record. |
| `outsideReads`, `notes` | As in the references record. |

A range has 1-based lines and columns, as in the references record. A snapshot with a
service that writes through a typed Knex client, a function that reads through the
client of another file, and a pg pool query gives this record. The snapshot ID is an
example, and the tool digests, `outsideReads` and `notes` are cut:

```json
{
  "formatVersion": 1,
  "attemptId": "s4-001",
  "snapshotRef": "snapshot-001",
  "status": "completed",
  "rulesRef": "s4-001-file@resource-access-rules.yaml",
  "rulesSha256": "1aa2f89711534596b75b316b6ccba78fa96f0d759fbcd014b56d2a45646a1e50",
  "settingsRef": "settings-001",
  "sourceSitesRef": "s4-001-file@source-sites.json",
  "scope": {
    "files": ["src/db.ts", "src/invoices.ts", "src/orders.ts", "src/reports.ts"],
    "groups": [{ "graphContext": "choom-default-v1-import", "graphContextRef": "s4-001-file@graph-profile.json#/contexts/0",
      "compilerSettingsRef": "settings-001#/parsingProfile", "files": ["src/db.ts", "src/invoices.ts", "src/orders.ts", "src/reports.ts"] }]
  },
  "queryOptions": { "allowJs": true },
  "tool": { "name": "ts-morph snapshot project (TypeScript type checker)", "node": "v26.13.0", "tsMorph": "28.0.0",
    "typescript": "6.0.2", "modules": { "ts-morph/dist/ts-morph.js": "..." } },
  "virtualRoot": "/repo",
  "candidates": [
    { "ruleId": "knex-insert", "ruleVersion": 1, "library": "knex", "resourceKind": "database-table", "operation": "write",
      "confidence": "receiver-type", "siteRef": null, "path": "src/invoices.ts",
      "sha256": "96eaf38b1ee959834bf1ea7fea0362d2be57274a07a1e1f5e50026318ba421d9",
      "range": [{ "line": 7, "column": 11 }, { "line": 7, "column": 46 }],
      "expression": "this.db('invoices').insert(invoice)", "truncated": false, "name": "invoices", "nameReason": null,
      "identity": "inferred-from-name", "context": { "kind": "method", "name": "InvoiceService.create",
        "range": [{ "line": 6, "column": 3 }, { "line": 8, "column": 4 }], "graphContext": "choom-default-v1-import" } },
    { "ruleId": "knex-select", "ruleVersion": 1, "library": "knex", "resourceKind": "database-table", "operation": "read",
      "confidence": "receiver-import", "siteRef": null, "path": "src/orders.ts",
      "sha256": "c620d608d14eaa182bbc89004ab5426ded936ec0068730b334bf33be250da38a",
      "range": [{ "line": 4, "column": 10 }, { "line": 4, "column": 35 }],
      "expression": "db('orders').select('id')", "truncated": false, "name": "orders", "nameReason": null,
      "identity": "inferred-from-name", "context": { "kind": "function", "name": "listOrders",
        "range": [{ "line": 3, "column": 1 }, { "line": 5, "column": 2 }], "graphContext": "choom-default-v1-import" } },
    { "ruleId": null, "ruleVersion": null, "library": null, "resourceKind": null, "operation": null,
      "confidence": "name-only", "siteRef": "s4-001-file@source-sites.json#/sites/4", "path": "src/reports.ts",
      "sha256": "e3d5dc90954586c4c5a54766d99e622e8f60065d60f194365d37d03ed22e155e",
      "range": [{ "line": 4, "column": 29 }, { "line": 4, "column": 69 }],
      "expression": "pool.query('SELECT total FROM invoices')", "truncated": false, "name": null,
      "nameReason": "No resource access rule found this call. Only its name is on the list of resource call names of the source sites, so it can access a resource.",
      "identity": "unknown", "context": { "kind": "function", "name": "totals",
        "range": [{ "line": 4, "column": 23 }, { "line": 4, "column": 69 }], "graphContext": "choom-default-v1-import" } }
  ],
  "omittedCandidates": 0,
  "gaps": [],
  "outsideReads": ["..."],
  "notes": ["A candidate is a call that a Choom resource access rule found (confidence receiver-import or receiver-type), ...", "..."]
}
```

Read the site of a candidate before a claim. The review can cite the record, or one
candidate, as evidence, such as
`s4-001-file@resource-access-candidates.json#/candidates/0`, and the Stage 4 resource
observations name the record as `resourceAccessCandidatesRef` (see the
[record format](record-format.md#resource-access-candidates)). Keep the observed
access of a candidate separate from the inferred identity and the owner of a
resource. The publisher checks each candidate against the saved snapshot.

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
not resolve; `unresolved` lists them, an import only with a relative module name
or a `paths` alias.

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
- A site of the same kinds whose `paths` alias the compiler settings do not
  resolve to a file. A `paths` alias is a module name that matches a key of the
  `paths` option of the query settings, as TypeScript matches it: a key without
  `*` that equals the name, else the key with one `*` whose prefix and suffix the
  name has, with the longest prefix. A key `*` alone matches every package name,
  so it does not make an alias. Examples are an alias of a folder that the
  capture did not save, and an extensionless alias of an ES module under
  NodeNext.

The type checker follows a literal `require` call in a JavaScript file, and a
`require.resolve` call with a literal module name loads nothing, so the helper
does not list them. A bare package name that matches no `paths` key, such as
`zod`, names an external package, which the snapshot never holds, and a relative
name or alias of a snapshot file that is not source code, such as `./theme.css`,
cannot hold the symbol, so the helper does not list them either. The helper finds
the saved site of each unresolved import with the walk of the source collection.
When no saved site matches, for example after the site limit of `collect`, the
entry has `siteRef: null`, and its lines and expression come from the compiler
syntax tree. With an unresolved entry, the references can be incomplete.

The helper does not find these uses, and `unresolved` has no entry for them:

- An import of a bare module name that does not resolve, also when `baseUrl`
  maps bare names to snapshot source. Such a name cannot be told apart from a
  package name.
- A destructuring assignment, such as `({ createInvoice } = billing)`, which
  assigns to names that exist already.
- A JSDoc type, such as `@type {import('./invoice').Invoice}`.

So `complete-within-scope` means that the helper found no unresolved entry. It is
not proof that the references are complete.

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
| `completeness` | `partial` when `unresolved` has an entry, else `complete-within-scope`: the helper found no unresolved entry. Neither value is proof of completeness: they do not cover the files outside the scope or the uses that the helper does not find. |
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
Read the behavior entry candidates as places to read, not as proven entries,
and name them in the entry analysis as behaviorEntryCandidatesRef.
Read the resource access candidates as sites to read, not as proven access,
and name them in resource-access.json as resourceAccessCandidatesRef.
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
| Code mapping | Explicit file scope (`unitKind: file`), one direct component owner per file or `owner: null`, reasons, and supporting evidence. Exact mapped files belong here; membership selectors belong in the baseline. Stage 4 keeps each file whole. |
| Resource observations | Inspected access sites, access kind, target identity or explicit unknown target, context, and source evidence. Observed access does not establish permission. Name the resource access candidates of collect as `resourceAccessCandidatesRef`; a candidate is observed access syntax, and its name does not establish the identity or the owner of a resource. |
| Entry analysis update | Preserve entry history and Knip limits. Add supported behavior entries and references to the separate graph reachability results. Name the behavior entry candidates of collect as `behaviorEntryCandidatesRef`. |
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
- A behavior entry rests on reviewed source ranges. A behavior entry candidate is a
  place to read; it does not make a behavior entry, and a missing candidate does
  not show that there is no entry.
- Reachability retains its context, roots, edge policy, stopped edges, and limits.
  No report difference or unreachable file is treated as proof of unused code.
- Resource observations and intended ownership remain separate. Unknown targets,
  missing dependencies, native-code coverage, and uninspected code remain visible.
  A resource access candidate is a site to read; a matching name does not show that
  two sites use the same resource.
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
