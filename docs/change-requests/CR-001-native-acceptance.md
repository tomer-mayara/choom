# CR-001 native acceptance

This procedure separates installed application evidence from browser tests,
mocked IPC, and compilation. Follow it with the exact candidate release build.
The current automated route supports Linux with X11 and GTK3 dialogs. macOS and
Windows use the manual route below. An unavailable route is a recorded limit,
not a passing or skipped test.

T01 establishes the driver and preserves directory-picker behavior. T05 adds
installed native analyzer operations; T06 adds portable document operations.
T07 implements Load Repo, Open Diagram, and export. Missing actions were T01
feature-red evidence; they are now regressions after startup and picker
characterization pass. No driver supplies an analyzer report or replaces IPC.

## Linux automated route

Use the repository's pinned Bun, Node, and Rust versions. The standalone client
is `webdriverio` 10.2.0; the pinned Node 26.13.0 satisfies its engine range.
Install dependencies before the run; the harness never installs tools:

```sh
bun install --frozen-lockfile
bunx --no-install playwright install chromium
cargo install tauri-driver --version 2.1.0 --locked
sudo apt-get install dbus webkit2gtk-driver xvfb xdotool
```

The ordinary Tauri Linux build dependencies are also required; see the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). Build the
ordinary release `.deb`, install it outside the checkout, and retain its build
identifier and hash. Do not use `target/debug`, `--no-bundle`, an application
with a WebDriver plugin, or a symlink back into this checkout as installed
release evidence. Choom installs as `/usr/bin/choom-desktop` to avoid a
conflict with the `choom` executable from `util-linux`.

Prepare the production frontend once for the source-free browser consumer:

```sh
bun run build
```

Set these variables for the actual installed artifact, then run smoke first:

```sh
export CHOOM_PACKAGED_APP=/usr/bin/choom-desktop
export CHOOM_PACKAGED_BUILD_ID=release-version-and-source-commit
xvfb-run -a dbus-run-session -- bun run test:behavior:packaged --tags @packaged-smoke
```

Prepare a separate dependency tree outside the Choom checkout for the real
analysis fixtures. Its `node_modules` must contain `dependency-cruiser` 18.7.2
and the TypeScript parser installed as
`typescript@npm:@typescript/typescript6@6.0.2`. Set its absolute path explicitly:

```sh
export CHOOM_PACKAGED_FIXTURE_MODULES=/absolute/prepared-fixture/node_modules
xvfb-run -a dbus-run-session -- bun run test:behavior:packaged --tags @packaged-native-analysis
xvfb-run -a dbus-run-session -- bun run test:behavior:packaged --tags @packaged-native-documents
xvfb-run -a dbus-run-session -- bun run test:behavior:packaged --tags @cr-001-t08
```

Run T05 and T06 native operations after smoke, then T08. The harness
validates the supplied dependency versions and copies the prepared tree into
each repository fixture. Relative links within that tree are preserved; external
links are refused. It does not install
dependencies or fall back to Choom's development `node_modules`. Smoke needs no
analyzer tree. The unfiltered command runs all
`@packaged` scenarios. `--tags <expression>` and `--name <expression>` select
cases; a tag selection always retains the `@packaged` constraint. The runner
requires a readable `dist/index.html` and does not rebuild it between runs.
A selection that matches no scenarios fails setup instead of reporting a pass.

`CHOOM_PACKAGED_APP` must be an absolute executable path. The runner resolves
symlinks and rejects paths inside the checkout. `CHOOM_PACKAGED_BUILD_ID` is an
operator-supplied release identifier; the runner separately hashes the actual
executable. Record the installer hash and signing state with the release record.

Optional executable overrides are `CHOOM_TAURI_DRIVER`, `CHOOM_WEBKIT_DRIVER`,
and `CHOOM_XDOTOOL`. Otherwise the runner resolves those tools on its own PATH.
It launches the product from a fresh directory outside the checkout with
`CHOOM_PACKAGED_RUNTIME_PATH`, defaulting to `/usr/local/bin:/usr/bin:/bin`.
Set this explicitly when the intended installed Node runtime is elsewhere.
This is a controlled launch environment; separately verify the desktop launcher's
runtime discovery before claiming Finder, Start-menu, or desktop-entry behavior.

The runner starts two external `tauri-driver` servers and their native WebKit
drivers, a local production preview, and a Playwright Chromium server for the
browser consumer. One product launch uses the configured runtime PATH. The other
uses an empty owned directory as its entire PATH. The acceptance driver checks
the running application's `/proc` environment and verifies that directory is
empty before using this second session for missing-runtime and saved-viewer
checks. Harness tools keep their own runtime environment.
It owns their cleanup and stops them on completion, failure, or interruption.
The consumer connects to the runner's browser server. Scenario temporary files
are placed inside the runner's temporary directory so forced Cucumber termination
does not leave fixture repositories behind. The product uses real IPC.
The native picker helper locates the installed executable's X11 process,
focuses its newly opened dialog, and uses `xdotool` to select the supplied path
or press Escape. For a folder selection, it opens Home to leave GTK's Recent
view and accepts the location entry's inline completion before submitting the
path. It requires the picker to close. The smoke scenario also checks the
displayed path and preservation after cancellation.
File selection accepts GTK's inline completion as well. Save replaces the
entire filename, including the extension that GTK leaves outside its initial
selection. The driver requires the exact selected export path to become readable.

The headless commands start a separate D-Bus session inside each X11 display
so services started on that bus can connect to the display. This route sets `GTK_USE_PORTAL=0` so the locked GTK3 dialog
backend remains in the application process. It does not claim Wayland or desktop
portal coverage. Tests do not confirm overwrite prompts automatically; use new
export destinations. The native driver rejects any existing destination and
waits for the application to write stable, readable version 1 YAML after the
save picker closes. A timeout or an unexpected native dialog fails the run.

T05's three `@packaged-native-analysis` cases call the production repository and
analyzer commands from the installed webview. They verify fresh reports after a
source edit, error findings in a completed report, refusal of partial output
after process failure, private report removal, disabled persistent cache,
cancellation after a real descendant starts, and retry in the same repository
session. These exercise native operations without changing the installed UI or
mocking IPC. They do not prove the later Load Repo controller or renderer.

T06's four `@packaged-native-documents` cases compose the real discovery,
analyzer, converter, codec, and document workflow with the installed native
commands. One declared component owns files in two source directories. The
route exports the analyzed document, removes its source repository, reopens the
export, and compares components and full file-pair evidence. Separate cases
check replacement consent, the two-snapshot limit, and candidate release without
removing the current snapshot. The TypeScript composition runs in the acceptance
process; every native operation crosses the installed webview's real IPC and
capability boundary. This proves assembled file operations, not the
Open Diagram/export UI or native save-dialog behavior. T08 scenarios exercise
those public controls on the ordinary installed candidate build.

T08 verifies exact declared cards and both file pairs from a component's two
subdirectories through real analysis, export, and reopening. It removes the
source repository and its local analyzer, closes the exporting application,
and opens the exported bytes in either the production browser (which has no
native analyzer boundary) or a fresh installed process with the empty PATH.
This proves that tools are unavailable to the viewer, not that Node is
uninstalled from the harness machine.

Installed failure cases cover missing Node, denied repository reads, a failed
analyzer, invalid UTF-8, and an unsupported document schema. Each preserves the
displayed diagram and identifies the failing stage. Cancellation starts a real
analyzer and descendant before pressing Cancel; the test then verifies both
processes stopped, private report removal, and another successful Load Repo.
Analyzer failure recovery presses the actual Retry button without a new picker.
Save-dialog write failures and layout faults are not included in these installed
UI cases. Native document-operation tests and controlled browser layout tests
provide distinct evidence for those boundaries.

Each run writes `test-results/packaged/run-*/` with:

- `run.json`: OS, architecture, runtimes, product environment, executable hashes,
  declared build ID, outcome, and exit code.
- Both driver logs and browser-preview logs, Cucumber results, and per-session screenshots
  and document source when a session could be opened.
- `setup-failure.json` when an installed WebDriver session cannot be established.

Exit `0` means the selected scenarios passed; `1` means scenario failure; `2`
means setup or cleanup failure. Interruptions use `130` or `143`. At T01, a
successful smoke followed by a missing Load Repo/Open Diagram assertion is
feature-red evidence. Missing executables, Node mismatch, unavailable X11,
session startup failure, and absent build output are setup failures. None count
as feature-red evidence. Preserve the reports from both runs together.

## Manual installed route on macOS and Windows

Use an unlocked desktop and the ordinary release bundle built from the candidate.
No WebDriver plugin, IPC replacement, developer server, or debugger is required.
Record each action and observed result, including cancellation and failures.
Keep screenshots and the exact artifact identity with the evidence record.

1. Build the ordinary platform release bundle with `bun run desktop:build`.
   Record the source commit, product version, OS version, architecture, bundle or
   installer SHA-256, and signing/notarization status. A successful build alone
   supplies no UI evidence.
2. Install it outside the checkout. On macOS, copy the newly built `Choom.app`
   into a distinct test installation directory and verify its Info.plist bundle
   identifier is `com.tomermayara.choom`. Keep any existing installation intact.
   On Windows, run the candidate installer and record the installed executable
   path. Confirm the installed artifact matches the candidate.
3. Create two ordinary directories outside the development checkout, named
   `Atlas` and `Other`. Launch the installed application from Finder on macOS or
   the installed shortcut/Start menu on Windows. Record any OS launch or
   permission failure; do not replace it with a development launch.
4. Confirm the window says **Choom**, displays **Desktop**, and shows the starter
   heading **Architecture starts here.** Open **Explore example**, confirm the
   example appears, then use **Close example**. Capture the visible result.
5. Click **Choose directory**. Confirm a real native directory picker opens.
   Select `Atlas`; confirm the application shows its full selected path.
6. Click **Choose directory** again. Navigate toward `Other`, then cancel the
   native picker. Confirm the displayed selection remains `Atlas` and the
   starter remains usable. Record picker selection and cancellation separately.
7. Confirm **Load Repo**, **Open Diagram**, and **Export Diagram** are present.
   Export is disabled until a diagram is loaded. If the native desktop is locked
   or inaccessible, record the blocked actions and stop the evidence record at
   the last actual observation.
8. Click **Load Repo** and select a small
   real repository with the supported local analyzer. Confirm the declared
   component cards and file-pair evidence. Export through the real native save
   picker into a new path. Close Choom and reopen that file through **Open
   Diagram** after moving the source repository and its local analyzer out of
   reach. For this fresh viewer, launch the installed executable with an empty
   owned directory as PATH, and record the actual process environment. Open the
   same exported bytes in the production browser without native analyzer access.
   In both viewers, verify cards, both deep evidence pairs, and the recorded
   analyzer version. Keep this controlled launch separate from the launcher
   discovery observation in step 3.
   Record actual output files and hashes; do not replace exports with fixture
   YAML or analyzer output generated by the harness.
9. On each claimed release platform, retain a previous diagram and exercise
   missing Node, denied repository access, failed analysis, invalid UTF-8, and an
   unsupported schema. Confirm the previous diagram and the correct failure
   stage remain visible. Correct the failed configuration and use **Retry**;
   confirm no new repository selection is required.
10. Start an analyzer with an observable child process. Press **Cancel** while
    both run. Confirm the old diagram remains, both processes stop, the private
    report is removed, and a corrected repository can load afterward. Picker
    cancellation alone does not prove analyzer cancellation.
11. Exercise replacement consent and failed file operations through the real
    native dialogs. Record the selected path, observed result, and whether the
    current diagram remains available. Keep results separate from native command
    tests that bypass the dialog.
12. Record layout-failure coverage separately. The controlled browser entry
    verifies preservation, cancellation, and late results, but is not installed
    release evidence. If a layout fault cannot be reproduced in the ordinary
    package, leave the installed case unverified; do not add a production test
    hook or label browser injection as a native result.

Use a platform/build matrix for runtime discovery, permissions, process
cancellation, file lifecycle, layout failure, and visible results. Record each
unavailable action and its reason. Compilation, MockRuntime handlers, native
operation tests, and installed UI tests prove different parts of the route.

Linux CI retains its ordinary `.deb`, the installed executable and installer
SHA-256 values, and the source commit alongside `test-results/`. Local runs must
retain equivalent identities. Signing or notarization status belongs in the
evidence record; an unsigned test package is not a signed distribution release.

No automated Windows or macOS adapter is included in T01. Record unavailable
checks in [cookbook/TODO.md](../../cookbook/TODO.md).

## Driver references and scope

[Tauri's direct WebDriver setup](https://v2.tauri.app/develop/tests/webdriver/manual-setup/)
supports Linux and Windows; macOS has no direct WKWebView driver. The selected
Linux route requires no application plugin. Current
[Tauri guidance](https://v2.tauri.app/develop/tests/webdriver/) also describes an
embedded cross-platform route, but that changes the test build and does not
replace installed release evidence.

[WebDriver cannot operate a native file picker](https://www.selenium.dev/documentation/webdriver/elements/file_upload/).
The Linux helper therefore uses real
[xdotool X11 interaction](https://github.com/jordansissel/xdotool) instead of a
file-input shortcut or an IPC mock. GTK3's
[file chooser implementation](https://github.com/GNOME/gtk/blob/gtk-3-24/gtk/gtkfilechooserwidget.c)
accepts an existing directory from the location entry in select-folder mode;
the smoke scenario must verify that behavior on the target system.
