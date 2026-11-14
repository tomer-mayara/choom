# Baseline viewer installed acceptance

This route tests the ordinary installed release through its real UI, native GTK
file picker, and native file read. The test driver stays outside the product.
It does not replace IPC or supply decoded baseline data to the app. Retirement
checks use the existing Tauri transport in the real installed window; they add
no product test hook or command-enumeration API.

The automated route supports Linux with X11. The local validation environment
also supports Linux ARM64 in a task-owned container. macOS, Windows, Wayland,
and desktop portal behavior require separate installed-app observations.
Compilation and mocked IPC do not supply that evidence.

## Prepare the Linux host

Use the versions pinned in `.bun-version`, `.node-version`, and
`rust-toolchain.toml`. Install the normal Linux Tauri build prerequisites from
the [README](../../README.md#set-up), then the acceptance tools:

```sh
bun install --frozen-lockfile
cargo install tauri-driver --version 2.1.0 --locked
sudo apt-get install dbus webkit2gtk-driver xvfb xauth xdotool xclip
```

The harness uses Node to run Cucumber and WebdriverIO. The installed app starts
with an empty owned directory as its complete `PATH` and an empty `NODE_PATH`.
The driver checks the running app's `/proc` environment, executable, and working
directory. This proves that Node and an analyzer cannot be found through the
product's runtime path; it does not mean Node is uninstalled from the test host.

There is no analyzer dependency fixture, production preview server, or Chromium
dependency in this installed route. Browser acceptance remains separate.

## Build, install, and identify the candidate

Build from the exact reviewed commit and record it. If a product build contains
uncommitted source, record its source archive and diff identity explicitly;
do not label it as the unchanged commit. Test-only overlays on an earlier
installed package must have their own file hashes.

```sh
bun run tauri build --bundles deb -- --locked
sudo apt-get install --reinstall -y ./src-tauri/target/release/bundle/deb/*.deb
mkdir -p test-results/packaged/release
cp ./src-tauri/target/release/bundle/deb/*.deb test-results/packaged/release/
sha256sum test-results/packaged/release/*.deb /usr/bin/choom-desktop \
  > test-results/packaged/release/artifacts.sha256
git rev-parse HEAD > test-results/packaged/release/source-commit.txt
```

Confirm that the installed executable matches the executable in the `.deb`.
CI performs this check before running acceptance. Reinstalling matters when
two candidate builds have the same package version.

Use `/usr/bin/choom-desktop`, outside the development checkout. A debug binary,
an unbundled executable, a symlink into the checkout, or a product with a test
plugin does not count as ordinary installed release evidence. Record the OS,
architecture, installer hash, executable hash, source identity, and signing
state. An unsigned local Linux package is not a signed distribution release.

## Run the installed scenarios

```sh
export CHOOM_PACKAGED_APP=/usr/bin/choom-desktop
export CHOOM_PACKAGED_BUILD_ID=the-exact-reviewed-commit
xvfb-run -a dbus-run-session -- bun run test:behavior:packaged --tags @bv-03
```

Use `--tags @baseline-viewer` for all installed baseline scenarios. `--name`
also selects scenarios. Every selection keeps the `@packaged` constraint.
An empty selection fails setup. The runner needs the installed artifact; it
does not build it or require a separate `dist` directory.

Optional tool overrides are `CHOOM_TAURI_DRIVER`, `CHOOM_WEBKIT_DRIVER`, and
`CHOOM_XDOTOOL`. The runner resolves those tools before launching the product
with the empty runtime path. Use a non-root app/test user.

BV-03 copies only the reviewed baseline into a fresh directory outside the
checkout. No source repository, local analyzer, or evidence bundle accompanies
it. The real Open Baseline action opens the native GTK picker. The test selects
that file, checks its baseline ID and five component names, checks that the old
repository/export actions are absent, and compares the selected bytes afterward.
Other scenarios cancel the native picker or select malformed YAML and legacy
diagram content. Each preserves the loaded baseline; invalid content also shows
a useful error. Picker cancellation must show **Load cancelled.** and enable
**Open Baseline** again. These UI cases complement the existing Rust read-limit, file
identity, file-type, and UTF-8 tests.

The complete-view scenario uses this same installed route. BR-02 updates it to
check five component nodes without relationship lines, inspection of all eight
interfaces and five resources through the catalog, and all 21 Rules entries in
the reviewed fixture. Each rule must expand and show
its ID, subject, expectation, and check. This is final assembled-app verification;
browser and DOM checks cover the same viewer behavior in more detail.

The `@br-03` and `@br-04` journey opens Workspace with one click, checks its five owned
interfaces, opens an interface, and uses Back. It selects Native shell while
the panel is open, then drags Workspace with real pointer input. The test checks
that its children follow, Native shell stays fixed, and inspection and camera
stay unchanged. It then moves Architecture model with an arrow key and checks
the 10-unit step, containment, and focus. With an owned interface open from the
baseline catalog, Fit must keep the manual geometry and contain all components.
Reset must restore the prepared geometry and the normal 100% starting view in
the current canvas. The interface stays open, and Back returns through Workspace
to the catalog with row focus restored. The selected file bytes stay unchanged.
DOM queries only observe results; they do not move components or dispatch input
events.

The `@bv-07` command-retirement scenarios request all 13 removed custom commands
with a closed-contract-invalid probe. The test catches rejection inside the
webview and requires the host's missing-command or ACL message. A registered
handler's `invalid-request` response fails the test, as does an external driver
error. Run `@baseline-viewer` against one exact installed package to verify native
opening, preservation, the complete view, and retirement together.

The BR-08 connection journey uses the standalone known-consumer fixture. Check
the initial Selected view with no arrows and self-connections off. Select a
component, inspect its arrow, and close the panel; focus returns to the owner's
header when the arrow disappears. All connections and Show self-connections
reveal the remaining known arcs. Keyboard focus reveals a transparent label.
Move an endpoint, Fit the shown drawing, and Reset while details remain open.
Reset keeps the connection choices and inspection. Cancelled and invalid opens
keep them too; a successful same-ID open restores fresh defaults. Check the
unknown-consumer fixture in All mode as well, so a quiet Selected view cannot
hide an endpoint-eligibility failure.

The picker helper finds the X11 window owned by the requested executable and
focuses its new native dialog. It types an absolute file path or presses Escape,
then requires the dialog to close. The Ctrl+L and Ctrl+A sequence uses a
200-millisecond key cadence so GTK can reveal and focus the location entry.
End and Return use the same cadence. The runner sets `GTK_USE_PORTAL=0` for the
application's GTK3 dialog backend and owns its D-Bus/X11 session. It does not
claim desktop portal or launcher behavior. Fixtures and child processes are
cleaned up after completion, failure, or interruption.

The BR-10 reading journey opens the actual version 2 publisher fixture through
this same native picker. It reads the saved function signature, examples,
result excerpt, source notes, access rule, and complete original records. Type
and data entries stay distinct. Malformed and excessive files, then picker
cancellation, must preserve the selected example and drawing. The real Copy
example control reports the host outcome. On success, the external harness uses
`xclip` to verify the exact clipboard bytes. On refusal, it checks manual-copy
guidance and selectable text. The evidence states which outcome was observed;
the installed app's clipboard is not mocked.

## Review the evidence

Each run writes `test-results/packaged/run-*/` containing:

- `run.json`: host and tool versions, executable hash, declared build ID,
  product environment, test-harness file hashes, outcome, and exit code.
- `cucumber.json`, the external driver log, and session screenshots and HTML.
- `setup-failure.json` if a usable installed session could not be established.

Exit `0` means the selected scenarios passed. Exit `1` means a scenario failed;
read the failing assertion before calling it acceptance red. Exit `2` means
setup or cleanup failed. Interruptions use `130` or `143`. Missing tools,
undefined steps, unavailable X11, Node version mismatch, and session startup
failure are setup errors. They are not evidence of missing product behavior.

The first BV-03 installed red used the ordinary `df8537e` release. Its startup,
native host, executable, runtime path, and working directory checks passed.
The `When` assertion then failed because **Open Baseline** was absent. Keep that
run and its separate test-only overlay hashes alongside the final green result.
The BV-07 red used the unchanged `96498ab` installed BV-03 product with a separate
test overlay. All 13 command assertions failed because the registered handlers
returned typed request errors. Keep that product identity separate from the
new harness hashes and final BV-07 package identity.
The complete identities belong in the [verification record](BV-baseline-viewer-evidence.md).

## Installed duplication assessment

Use the same installed executable and Linux/X11 setup for the duplication
assessment. The harness copies the producer's saved version 2 baseline and
report into a temporary directory, then selects each through its native picker.
It checks the saved comparison, the recorded entry, Back focus, invalid report
replacement, removal, and the unchanged selected files. The executable runs
with the empty product `PATH` used by the installed baseline scenarios.

```sh
xvfb-run -a dbus-run-session -- bun run test:behavior:packaged --tags @interface-duplication
```

The `@baseline-viewer` suite includes this journey. See the
[producer fixture record](../../test/fixtures/interface-duplication/producer-provenance.json)
for the selected files and their hashes.

### CR-002 Linux package identity

The release build from frozen Git tree `67d31b7a6d93d97fee57922dbb2156cc6c98e8cd`
used Bun 1.4.4, Node 26.13.0, and Rust 1.99.1. It included the final producer
fixture identified in the [CR-002 evidence record](CR-002-evidence.md). The
installed executable matched the bytes extracted from the unsigned local `.deb`.

| Artifact | SHA-256 |
| --- | --- |
| Frozen source archive | `618e71d4621d1c2379410770c1ab9e51fa01c780cb96d51e070ebc4c8d63a763` |
| Candidate patch | `d4f57be1172f493cd516ccc2c66096a02b041d661c0047fce77fc066656b1ac2` |
| `Choom_0.1.0_arm64.deb` | `e891a3aee098cabf76d05e458973190fa335e9b8b4be539d5823f86c82f5f9aa` |
| `/usr/bin/choom-desktop` | `be3e460bdbee9767887e1daffe7885617fe29a36d135d31b81b23be7a5a897ff` |
| Installed test selector patch | `039bc8fc42f85d4e94e809a2f206c6cefff7c0f05273f9079e6022fd7219ea6b` |

Run `run-2bmVdT` passed 23 scenarios and failed the report-opening assertion.
The original locator concatenated both responsive text spans, so it could not
find the report button by one label. The corrected test locator matches the
explicit ARIA label and falls back to button text for **Open Baseline**. The
focused rerun `run-Y907xY` passed all eight steps on the same installed binary.

The next full run, `run-C8ZsAL`, passed the duplication scenario and timed out
waiting for the GTK picker to close in the standalone baseline scenario.
The run used a fresh working directory and started after the prior runs had
exited. The prior overlapping runs used separate X11 displays. The cause of
the timeout was undetermined.

Serial rerun `run-WljTns` passed all 24 scenarios and 143 steps with the final
report fixture and the same installed executable. Both harness processes
exited successfully. The run retains the comparison screenshot, installed
process environment, and hashes of its test harness inputs.

Installed testing here covers Ubuntu 24.04.5 ARM64 with X11, GTK 3.24.41, and
WebKitGTK 2.52.6. macOS and Windows installed behavior, Wayland, and desktop
portal behavior remain unverified. The local package and test evidence are in
`~/.cache/choom-cr002-validation/work/evidence/products/tree-67d31b7a6d93d97fee57922dbb2156cc6c98e8cd/`.

## Manual installed checks on other platforms

Build and install the ordinary candidate bundle outside the checkout. Preserve
existing installations and record source, package, executable, OS, architecture,
and signing identities. Open only a copied baseline with no source repository or
companion files. Check the five-component overview without relationship lines,
side-panel access to all eight interfaces and five resources, all 21 Rules
entries, parent dragging, child movement with arrow keys, and continued
inspection while arranging the drawing. Also check the BR-08 connection journey
above with the separate known-consumer fixture. Fit must keep manual positions; Reset
must restore the initial geometry at 100% zoom and keep inspection and Back
navigation. Check the absence of old actions,
unchanged file bytes, native picker cancellation, and invalid-file preservation. Record
each actual observation and screenshot.

Verify the launched process environment separately when claiming operation
without an analyzer runtime. A terminal launch does not verify Finder,
Start-menu, or desktop-entry behavior. Record unavailable platform checks as
limits; do not replace them with browser results or mocked native commands.

### macOS picker automation check

Use the supported computer-use interface for native UI actions. Keep file
selection and the resulting application state as separate observations:

1. Record the running app path, executable hash, macOS version and selected
   file identity. A disposable comparison build is not the original app.
2. Open the native picker and inspect its current state before sending input.
   After using Go to Folder, verify the entered path before pressing Return,
   then verify the resulting directory and selected file.
3. Check whether Open is enabled. A selected accessibility row alone does not
   show that the panel has accepted the selection. Do not force a disabled
   control or count a failed input action as an application result.
4. If automated selection stalls, record the actual state and elapsed interval.
   Use a manual control on the unchanged app: bring Choom to the front, select
   the same file with the mouse, and open it. Pause automated input during this
   handoff.
5. Observe the resulting app state after the handoff. If the manual action
   succeeds, record that success and the automation limit separately. Do not
   report the automated attempt as passing or infer a file-filter defect.
6. Verify report selection, cancellation and invalid-file preservation
   separately before claiming a complete macOS journey.

The [2026-11-14 investigation](BV-macos-picker-investigation.md) followed this
control and confirmed manual baseline opening in the unchanged app. Removing
the YAML filter or changing the dialog window level did not establish a fix for
the automated interaction. No product workaround was retained.
