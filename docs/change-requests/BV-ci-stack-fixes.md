# Baseline viewer CI follow-up

On 2026-11-11, BV-01 had passing PR checks, but a push run failed an existing
Windows test. The same failure appeared on BV-06. BV-04 through BV-07 had Ubuntu
package setup failures before product checks. This follow-up starts at BV-01
and is merged through all seven branches. It preserves the original commits
and release evidence.

## Changes

The Ubuntu runner's mirrors repeatedly failed DNS lookup and exhausted the jobs'
time limits. Switching from the Azure mirror to archive.ubuntu.com did not fix
this: Canonical reported a
[DNS outage](https://status.canonical.com/rss), also reported in the
[runner-images issue](https://github.com/actions/runner-images/issues/15296).
Both Linux jobs now use the HTTPS Ubuntu mirror at
[Kernel.org](https://mirrors.kernel.org/), which uses independent DNS. Kernel.org
is listed in Ubuntu's
[official mirror registry](https://launchpad.net/ubuntu/+archivemirrors).
The change only replaces the runner's mirror-list URL. Ubuntu suites and signing
keys stay in place. APT must fail if its index update is incomplete, including
when Playwright invokes APT. Package lists, signature checks, test commands, and
job time limits stay in place. The
[runner image setup](https://github.com/actions/runner-images/blob/main/images/ubuntu/scripts/build/configure-apt-sources.sh)
defines the mirror-list path.

The Windows missing-notification test stopped both fixture processes, then
assumed the job PID list was already empty. CI disproved that timing assumption.
The test now waits for the empty list within its existing five-second deadline.
A query failure or timeout still fails. The checks for incomplete process
history, repeated cleanup timeouts, and retained process identity are unchanged.

Local validation also exposed a stale-session fixture race. The fixture acquired
a lock before dropping the session. A concurrent fork can inherit that lock
briefly, which correctly makes cleanup preserve the session. The fixture now
writes a valid inactive lease without acquiring a lock. The test still checks
owned-file removal, unknown-file and symlink preservation, and protection of a
real active session.

These are CI and test-fixture changes. Product behavior is unchanged. BV-07
already removes the two old native test modules, so it retains their removal
when the fixes are merged forward.

## Validation

- All 65 Rust tests passed locally on macOS for both BV-01 and BV-04 after the
  fixture corrections. Cargo formatting and Clippy passed.
- Both workflow blocks passed YAML parsing and Bash syntax checks. Comparison
  with the prior workflow confirmed that every existing step remains.
- The four required Kernel.org suites (`noble`, `noble-updates`, `noble-security`,
  and `noble-backports`) returned their `InRelease` files over HTTPS. Each
  signature passed verification with the existing Ubuntu archive keyring. Each
  file lists all four Ubuntu components for amd64. No trusted keys were added.
- Habit Hooks passed with an empty snooze file. Independent review found no
  weakened assertions or missing CI checks.
- Hosted BV-04 macOS and Windows jobs passed after the fixture corrections.
  Updated hosted checks must still verify Ubuntu package installation and all
  checks on the final heads of the seven branches.

Local logs are in `reports/ci-stack-fixes/`. Use the checks on
[BV-01](https://github.com/tomer-mayara/choom/pull/18),
[BV-02](https://github.com/tomer-mayara/choom/pull/19),
[BV-03](https://github.com/tomer-mayara/choom/pull/20),
[BV-04](https://github.com/tomer-mayara/choom/pull/21),
[BV-05](https://github.com/tomer-mayara/choom/pull/22),
[BV-06](https://github.com/tomer-mayara/choom/pull/23), and
[BV-07](https://github.com/tomer-mayara/choom/pull/24) for current hosted results.
