# Recorded dependency-cruiser reports

These reports came from the installed dependency-cruiser 18.7.2 CLI and Node
24.20.0. `recording.json` records the arguments, exit status, and stderr. The JSON
reporter returned exit status zero for both rule errors and a missing required
SWC transpiler. `summary.environment.issues` carries the latter warning.

`sources.json` preserves the authored source and configuration files and the
internal symlink. To repeat a recording, restore `files` below a temporary root,
restore `symlinks` as directory links, and run the pinned CLI from that root with
the recorded arguments. The vendor package is an authored fixture, not an npm
download. The SWC case requires an environment without `@swc/core`.

Only `summary.optionsUsed.baseDir` was changed from the temporary absolute root
to `.`. This avoids committing a machine-specific path and matches the portable
root marker accepted by the converter. Other fields are recorded output.

The complete report covers TypeScript type imports, dynamic imports, aliases,
an internal symlink, reference-only JSON, a vendor package, a builtin, unresolved
imports, and module, dependency, cycle, reachability, folder, and instability
findings. The tests use a native-path contract double; these fixtures verify
conversion of completed output. They do not verify a production process runner.

Pinned upstream references: [output format](https://github.com/sverweij/dependency-cruiser/blob/v18.7.2/doc/output-format.md),
[options](https://github.com/sverweij/dependency-cruiser/blob/v18.7.2/doc/options-reference.md),
and [environment checks](https://github.com/sverweij/dependency-cruiser/blob/v18.7.2/src/analyze/summarize/verify-environment.mjs).
