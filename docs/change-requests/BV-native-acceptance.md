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
sudo apt-get install dbus webkit2gtk-driver xvfb xauth xdotool
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

BV-07 adds one complete-view scenario to this same installed route. It checks
all 18 visual items, the 12 recorded ownership links, no consumer arrows, and
all 21 Rules entries in the reviewed fixture. Each rule must expand and show
its ID, subject, expectation, and check. This is final assembled-app verification;
browser and DOM checks cover the same viewer behavior in more detail.

The `@bv-07` command-retirement scenarios request all 13 removed custom commands
with a closed-contract-invalid probe. The test catches rejection inside the
webview and requires the host's missing-command or ACL message. A registered
handler's `invalid-request` response fails the test, as does an external driver
error. Run `@baseline-viewer` against one exact installed package to verify native
opening, preservation, the complete view, and retirement together.

The picker helper finds the X11 window owned by the requested executable and
focuses its new native dialog. It types an absolute file path or presses Escape,
then requires the dialog to close. The runner sets `GTK_USE_PORTAL=0` for the
application's GTK3 dialog backend and owns its D-Bus/X11 session. It does not
claim desktop portal or launcher behavior. Fixtures and child processes are
cleaned up after completion, failure, or interruption.

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

## Manual installed checks on other platforms

Build and install the ordinary candidate bundle outside the checkout. Preserve
existing installations and record source, package, executable, OS, architecture,
and signing identities. Open only a copied baseline with no source repository or
companion files. Check all 18 items, 12 ownership links, no consumer arrows,
all 21 Rules entries, absence of old actions, unchanged
file bytes, native picker cancellation, and invalid-file preservation. Record
each actual observation and screenshot.

Verify the launched process environment separately when claiming operation
without an analyzer runtime. A terminal launch does not verify Finder,
Start-menu, or desktop-entry behavior. Record unavailable platform checks as
limits; do not replace them with browser results or mocked native commands.
