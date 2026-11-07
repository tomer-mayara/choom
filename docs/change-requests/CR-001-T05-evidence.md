# CR-001-T05: Native analyzer execution and cancellation

Implementation evidence for
[CR-001-T05](CR-001-architecture-import.md#cr-001-t05--run-and-cancel-the-concrete-strategy).
Work started from merged T04 commit `dd657ee` on `codex/cr-001-t05`.
Implementation is complete. The ordinary Load Repo UI
belongs to T07; the new execution APIs are usable without that UI.

## Result and ownership

The concrete architectural layer injects a runner and `ReportConversion`.
The runner uses product-specific desktop job operations and keeps process
failures and cancellation out of conversion. Rust owns runtime/package
selection, arguments, working directory, process groups or Job Objects, bounded
private output, and cleanup. The caller retains its repository session.

Native jobs are prepared before starting Node so cancellation has a stable
identity during setup. Run, cancel, and release wait for their required cleanup.
The strategy checks cancellation through conversion and suppresses stale
documents. TypeSpec owns native and concrete execution data; live cancellation
and progress channels remain implementation bindings.

See the [execution contract](../../cookbook/interfaces/desktop-analyzer.md) for
ownership, supported installations, error meanings, and initial bounds.

## Four constraints

| Constraint | Change and evidence |
| --- | --- |
| Behavioral | Added [23 public API scenarios](../../cookbook/behavior/architecture-import/t05-api.feature) before production implementation. Separate [installed native-operation scenarios](../../cookbook/behavior/architecture-import/t05-installed.feature) use real IPC and the local analyzer before the later UI workflow. |
| Observability | Native progress and terminal outcomes report coarse stages and elapsed/duration data. The layer adds conversion and validation notifications. Errors and progress exclude raw streams and host paths. OpenSLO stays unmeasured. |
| Architecture | The existing named composition exception allows the new strategy, runner, and converter wiring. Platform stays independent of domain/workspace. Native command permissions and the main-window capability constrain process access. |
| Interface / contract | Added [desktop-analyzer.tsp](../../cookbook/interfaces/desktop-analyzer.tsp), concrete execution operations, and generated outputs. Neutral progress accepts optional elapsed milliseconds and the cleanup stage. Runtime transport validation and native wire conformance supplement compilation. |

## Behavior-first development

The initial API Cucumber run failed with 23 undefined scenarios and 88 undefined
steps. Native lifecycle/report tests then failed because `AnalyzerService` was
absent. Frontend runner and platform tests failed at the missing implementations.
These failures preceded production implementation.

## Upstream research

Pinned 18.7.2 metadata declares `bin/dependency-cruiser.mjs` and Node
`^22||^24||>=26`. Real npm, Bun hoisted/isolated, and pnpm installs successfully
analyzed a two-module TypeScript fixture. In-root package-store links work;
external installations remain unsupported. The `.bin` entry can be a shell
wrapper, so native execution uses the verified package entry directly.

Real CLI probes established that inputs must remain relative when `baseDir` is
set, fixed JSON output can contain error findings with exit zero, `--no-cache`
overrides valid cache settings, and configuration stdout stays outside a named
report. Focus/reaches/collapse survive in effective report options and remain
the converter's responsibility.

The config loader uses an unescaped file URL. A literal percent escape in its
path selected a different local config in a real probe. Native setup rejects
`%`, `#`, and `?` in the canonical configuration path. The pinned glob scanner
also treats parenthesized input names as patterns; native literal-input checks
must reject them. These restrictions explain specific upstream behavior rather
than pretending to preflight arbitrary JavaScript configuration.

A local Choom-source probe produced a 66886-byte report with 43 modules in
677 ms. Two-module reports were about 5.3 KiB. These are small-fixture
observations, not a production workload baseline or service objective.

## Initial verification

| Check | Result |
| --- | --- |
| `bun run check` | Passed: 224 native unit tests, 1 DOM unit test, 107 Cucumber scenarios / 393 steps, 71 interface tests, TypeSpec output checks, lint, cookbook links, dependency rules, unused code, and duplication. |
| Focused T05 frontend tests | 44 unit/interface tests / 229 assertions and 23 API scenarios / 88 steps passed. |
| `bun run check-types` | Passed. |
| `bun run build` | Passed; the existing deferred ELK chunk size warning remains. |
| `bun run habit-hooks --all` | Passed without findings. The snooze file remains empty. |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked` | 47 tests passed: 31 unit/IPC and 16 repository integration tests, with none ignored. Includes real dependency-cruiser 18.7.2 through the native service. |
| Cargo formatting and Clippy | `fmt --check` and `clippy --locked --all-targets -- -D warnings` passed. |
| Windows cross-compilation | An isolated temporary crate containing the actual analyzer and repository modules passed `cargo clippy --target x86_64-pc-windows-msvc --all-targets -- -D warnings`. This checks production and test compilation, not Windows execution or the full Tauri Windows package. |
| Retained browser acceptance | `bun run test:e2e --tags 'not @cr-001'`: 4 scenarios / 51 steps passed. |
| Original T05 browser scenarios | All 12 still fail at the absent Load Repo action. The new API scenarios pass; these UI cases remain for T07. |
| Linux installed scenario bindings | All 3 T05 scenarios / 24 steps bind in dry run. Installed Linux execution is unavailable on this macOS host; its runner reports setup exit 2. |
| `bun run desktop:build` | Ordinary macOS app and DMG built successfully. Separate installed observations follow. |
| Review and text checks | Independent source review completed with no remaining actionable findings. Manager reviewed the complete candidate and artifact links; `git diff --check` passed. |

Local tools are Bun 1.4.3, Node 24.20.0, and Rust 1.99.1 on macOS 27.0.1 arm64.
Bun and Node differ from repository pins 1.4.4 and 26.13.0; pinned CI results
must be considered separately. Node 24 satisfies the analyzer's supported range.

Review added regressions for a source path replaced by a FIFO, descendant
termination after the parent exits, synchronous cancellation transport errors,
partial process/report setup, replaced report growth, moved report directories,
repeated cleanup, and a lost terminal reply. Clean finished jobs permit retry;
failed cleanup retains the owned resources and blocks another job. No process
group adoption policy or generic command execution API was added.

Local logs are `/tmp/choom-t05-check-final.log`,
`/tmp/choom-t05-habit-final.log`, `/tmp/choom-t05-rust-all.log`,
`/tmp/choom-t05-rust-clippy.log`, `/tmp/choom-t05-windows-clippy.log`,
`/tmp/choom-t05-browser.log`, and `/tmp/choom-t05-ui-scope.log`.

## Installed macOS observations

The ordinary release was copied outside the checkout and launched through
Finder. Its executable path was checked against that installation. Startup
showed Desktop and the starter heading. The example rendered its three nodes
and two directed relationships. A real native picker selected `Atlas`; navigating
to `Other` and cancelling retained `Atlas`. The app then quit. Load Repo is
absent, so these observations do not claim ordinary UI analysis.

The tested ordinary executable SHA-256 is
`62018015a8ca803078e51c003f7bf34a561e28f7fbfac5a5b827f940981f16d2`.
Its copied DMG SHA-256 is
`a0a8ff5967d227997be7630a7f9da6377ae2102d6e8f758d5ab665e99c503419`.
The bundle identifier is `com.tomermayara.choom`; it is a local ad-hoc signed
build, without release signing/notarization evidence.

A separate instrumented bundle used a temporary test frontend and identifier
`com.tomermayara.choom.t05-probe`. It imported the real discovery, composition,
platform, strategy, runner, and converter code and used the production Rust
commands and main-window permissions. No IPC or analyzer double was installed.
Each fixture had an independent dependency tree copied inside its selected root.
The Node executable was configured explicitly.

The visible probe reported all five checks passed:

1. Source-to-model analysis retained exactly three declarations, including one
   workspace owning files in both `src/ui` and `src/services`. It produced one
   package relationship with canonical file evidence and an error finding.
2. A real nonzero process that wrote partial report bytes returned failure and
   did not enter conversion.
3. Cancellation after a real child process became ready returned cancelled.
4. A missing configured Node executable returned a prerequisite failure.
5. Another full analysis succeeded after cancellation and failure.

The successful analysis also observed setup, analysis, cleanup, conversion,
and validation with nondecreasing elapsed time. Separate filesystem/process
checks confirmed private report permissions, removed reports and their owned
directories, and stopped analyzer/child PIDs for success, failure, and
cancellation. This is assembled integration evidence with a test frontend; it
does not prove the future Load Repo UI or Finder PATH-based Node discovery.

The instrumented executable SHA-256 is
`c33a5a9ee7844d0168c8fdcdb2b3de726b9a97e1e54dcbbbde83b2be7e70f89c`.
Local artifact identities, observed UI notes, the probe source/configuration,
and cleanup observations are in `test-results/t05-macos/`. The normal release
build output is restored after the probe.

## Native CI repairs

The initial CI run exposed three platform failures and a previously blocked
Linux acceptance path. The fixes preserve the existing behavior and TypeSpec
contracts; no test or permission check was disabled.

- Linux installs `/usr/bin/choom-desktop`, because `util-linux` already owns
  `/usr/bin/choom`. A Linux-only Tauri configuration keeps the display name Choom.
- Windows embeds the Common Controls v6 manifest through the MSVC linker for
  application and test executables. The default resource path only covered app
  binaries, so test startup could not resolve `TaskDialogIndirect`. This follows
  [Tauri's own test workaround](https://github.com/tauri-apps/tauri/blob/dev/examples/api/src-tauri/build.rs).
  IPC fixtures now use Windows' `http://tauri.localhost` embedded origin. The
  moved-directory fixture parks the open report before moving its directory,
  as required by Windows, while preserving every cleanup and retry assertion.
- macOS cleanup continues bounded reaping and observation when Darwin reports
  `EPERM` for a zombie-only process group. Success still requires the group to
  disappear. Two real-process regressions retain an unreaped child with
  `waitid(WNOWAIT)`; both failed before the fix and pass afterward. The original
  descendant test failed on repetition 11 before the fix, then passed 50
  consecutive runs covering completion, cancellation, and shutdown.
- Linux acceptance starts a fresh D-Bus session inside Xvfb. The inherited
  hosted bus left GTK waiting for desktop-portal activation before WebKit's
  inspector could start. A controlled Ubuntu 24.04 reproduction observed the
  25-second portal timeout and inspector connection after the test deadline.
  The fresh bus received the X11 display, activated the GTK portal backend, and
  opened the installed application normally. Temporary startup diagnostics and
  the ineffective compositor override were removed.
- Folder selection leaves GTK's empty Recent view and accepts the location
  entry's inline completion before submission. The native dialog, displayed
  selection, cancellation, and closure assertions remain in place.

Local checks after the repairs passed: `bun run check`, type checks, frontend
build, Habit Hooks with an empty snooze file, 49 Rust tests, formatting, Clippy,
the ordinary macOS app/DMG build, and four retained browser scenarios. Source
review found no remaining actionable issue in the repairs.

[Hosted Windows and macOS](https://github.com/tomer-mayara/choom/actions/runs/42351696542)
passed on the repaired native code: Windows ran 39 Rust tests and built the app;
macOS ran 49 Rust tests and built the app. Final hosted validation is linked in
[PR #8](https://github.com/tomer-mayara/choom/pull/8).

Independent Linux verification used installed release packages outside the
checkout and the pinned Bun, Node, Rust, and analyzer versions. Debian arm64
passed picker smoke (1 scenario / 6 steps), three fresh-profile repetitions,
and all T05 native operations (3 scenarios / 24 steps). Matching Ubuntu 24.04
WebKitGTK 2.52.6 and portal packages verified the startup diagnosis and fresh-bus
invocation without disabling the browser sandbox. The four T08 scenarios reached
installed sessions and failed at the expected absent Load Repo/Open Diagram UI.

The tested Linux package SHA-256 is
`585af249c6e5692299eec22fc22c1091023fc7e87e21e00b6b1d0f7d0e7d5460`.
Local evidence is under `/tmp/choom-pr8-linux-evidence`. The earlier macOS hashes
above identify the initial implementation artifacts, not the repair build.

## Remaining scope

T06 owns saved YAML and T07 owns Load Repo and its trust notice. The ordinary
installed macOS UI cannot invoke the new analysis path before T07. Linux
packaged tests exercise production native commands directly through the
installed webview without adding a product test hook. Native Windows tests and
Linux installed operations now have the evidence above; released
signing/notarization remains unverified. The macOS instrumented bundle cannot replace ordinary release UI
acceptance. Platform-specific evidence must not be inferred from another OS.
