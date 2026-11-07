# Desktop analyzer execution

[desktop-analyzer.tsp](desktop-analyzer.tsp) owns the native dependency-cruiser
job requests, results, and progress data. The platform binds the operations to
promises and a live progress callback. Tauri channel handles are outside the
serialized data contract. Commands are restricted to the local main window.

The workspace's [execution contract](dependency-cruiser.tsp) uses native facts
behind `ArchitecturalLayer`. `DepCruiserArchitecturalLayer` receives an execution
collaborator and a `ReportConversion`. The runner owns native jobs. Conversion
retains the common builder's component ownership and aggregation rules.

## Job lifecycle

1. `prepareDepCruiser` reserves a job for an open repository session and selected
   configuration and literal inputs. It starts no process.
2. `runDepCruiser` starts the job once, checks prerequisites, runs the analyzer,
   reads its report, stops remaining owned descendants, and cleans temporary
   output before returning a terminal result.
3. `cancelDepCruiser` handles prepared and running jobs. Its acknowledgement
   means native work has stopped and cleanup has completed. It does not imply
   that an already completed run originally ended as cancelled.
4. `releaseDepCruiser` stops remaining work, cleans owned output, and removes the
   job. The runner calls it on every exit path after receiving a job ID.

Cancel and release are idempotent for legitimate completed or released IDs.
Impossible IDs and malformed requests fail. Jobs are distinct from repository
sessions. The runner borrows the session and leaves it open for conversion.
Closing a session invalidates its native lease; running work observes that
invalidation. Cancellation and release wait for cleanup.

An already cancelled signal creates no job. Cancellation while preparation is
pending waits for the ID, then stops and releases that job. Cancellation during
execution waits for native completion. Cancellation before or during conversion
suppresses the document. Cleanup failure remains a failure, never successful
cancellation. Progress observer failures cannot abandon a native job.

The native service permits one prepared or running analysis at a time. Prepared
reservations expire after 120 seconds, and application shutdown stops active
work. A clean finished slot can be replaced by the next request even if its
caller lost the terminal response. Report bytes belong to the running operation.
Failed cleanup retains ownership and prevents further temporary-file growth
until it succeeds. Each cleanup attempt has a five-second deadline.

## Runtime and package selection

A configured `nodeExecutable` must be an absolute executable path. Otherwise
native code searches absolute entries in the packaged application's `PATH` for
Node. It invokes no shell, package script, package manager, or installer. Missing
GUI runtime discovery returns guidance to configure an absolute Node executable.

The supported analyzer is dependency-cruiser 18.7.2 at the selected root's
`node_modules/dependency-cruiser`. Native checks its manifest, version, engine
range, and executable entry. The canonical package must remain inside the root;
the entry must remain inside the canonical package. Direct npm/Bun installs and
in-root Bun/pnpm stores are supported. Global installations, parent-workspace
fallback, external store links, and Plug'n'Play are unsupported.

Its Node range is `^22||^24||>=26`: stable Node 22, 24, or 26 and later.
Prereleases and stable Node 23 or 25 do not satisfy it. The installed application
discovers its runtime independently of Choom's development dependencies.

Native constructs an argument array with the verified entry, configuration,
fixed JSON output, private report path, disabled cache/progress, and `--` before
the inputs. The process runs at the canonical selected root. Inputs stay
relative because upstream applies its own `baseDir` handling. The converter
rejects a non-root effective base; execution does not override configuration.

Configuration and inputs must be contained, existing, literal paths. Inputs
reject glob characters, including parentheses, after canonicalization. With
this pinned analyzer, `%`, `#`, or `?` in the canonical absolute configuration
path are unsupported: its config loader builds a file URL without escaping
them and can otherwise select a different file. Spaces and ordinary Unicode
remain supported. Errors explain the restriction without exposing the host path.

## Output, cleanup, and progress

Configuration stdout is never parsed as a report. Native creates a private
report file, retains its owned handle, and reads only after process success.
Replaced, nonregular, oversized, missing, or invalid output fails. Nonzero exits
and timeouts return no partial report. Rule errors in valid exit-zero reports
are findings. Conversion separately checks effective report semantics and
missing-transpiler issues.

Cleanup checks the private directory's identity. A moved or replaced directory
causes cleanup failure and retains the job; it is not treated as removed. After
successful cleanup, another release cannot delete a new directory at that path.

Unix execution owns a process group. Linux checks for live group members; macOS
waits for the group to disappear. Darwin can return `EPERM` while a group contains
only exited processes that have not been reaped. Cleanup continues reaping and
observing within its deadline; that error alone never means cleanup succeeded.
Windows execution uses an owned Job Object assigned before child execution.
Process notifications retain identity-checked member handles during execution.
Cleanup also captures current members before terminating them individually. It
waits until every retained process has signaled, a fresh complete member list is
empty, the notification queue is drained, and retained identities cover the
job's lifetime process count. An access-denied termination request can race
another termination request; cleanup continues stopping other members and
observing the same handle within its deadline. The error itself is not success.
Handles remain owned after a failed cleanup so a retry can observe the same
processes. Each notification read releases its thread association, so cleanup
can move between native worker threads.
An empty job accounting count alone is not a completion barrier: Windows
[process termination is asynchronous](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-terminateprocess).
Windows process notifications are best effort. If a transient process cannot be
retained and the lifetime count cannot be reconciled, cleanup fails rather than
claiming that an empty current member list proves completion. Processes created
outside the job remain outside this ownership boundary.

Normal completion, cancellation, timeout, and errors stop remaining owned
descendants and reap the direct child. Raw streams, host paths, and source
contents are not error or progress fields.

Native progress carries the job, a coarse `setup`, `analysis`, or `cleanup`
stage, and elapsed milliseconds. Terminal native results include duration.
The layer reports coarse visited stages and nondecreasing elapsed time,
including conversion and completed validation. These are local observations,
not production telemetry or a timing objective.

Initial limits are 120 seconds for setup and execution, 1 MiB each for stdout
and stderr, 16 MiB for report text, 128 input paths, and 4096 UTF-8 bytes per
path. Windows cleanup retains at most 1,024 process handles for a job and refuses
an incomplete member snapshot. Fixture checks establish resource bounds, not a measured large-repository
performance guarantee. Repository and converter bounds also apply.

JavaScript configuration executes trusted repository code. Process and path
checks do not sandbox that code or reverse its side effects. T07's Load Repo
flow must explain this before execution, for example: “Loading this repository
runs its local analyzer and JavaScript configuration. Continue only if you
trust this repository.” Runtime selection is a composition option and is not
saved in the architecture document.

See the pinned [package metadata](https://github.com/sverweij/dependency-cruiser/blob/v18.7.2/package.json),
[CLI](https://github.com/sverweij/dependency-cruiser/blob/v18.7.2/doc/cli.md),
[config loader](https://github.com/sverweij/dependency-cruiser/blob/v18.7.2/src/config-utl/extract-depcruise-config/read-config.mjs),
[Tauri channels](https://v2.tauri.app/develop/calling-frontend/#channels), and
[process-wrap](https://docs.rs/process-wrap/10.0.1/process_wrap/).
The [T05 evidence record](../../docs/change-requests/CR-001-T05-evidence.md)
separates API, native-service, and installed-application checks.
