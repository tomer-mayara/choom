# Baseline viewer CI follow-up

On 2026-11-11, BV-01 through BV-03 had passing CI. BV-04 through BV-07 had
Ubuntu package setup failures before product checks. BV-06 also failed an
existing Windows test. This follow-up starts at BV-04 and is merged into the
later branches. It preserves the original commits and release evidence.

## Changes

The Ubuntu runner's mirror list tried the Azure archive, which repeatedly failed
DNS lookup and exhausted the jobs' time limits. Both Linux jobs now use the
official Ubuntu HTTPS archive. APT must fail if its index update is incomplete,
including when Playwright invokes APT. Package lists, signature checks, test
commands, and job time limits stay in place. The
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

- All 65 Rust tests passed on macOS after the fixture correction. Cargo
  formatting and Clippy passed.
- Both new workflow blocks passed YAML parsing and Bash syntax checks. An
  isolated execution wrote the exact expected mirror and APT configuration.
  Comparison with the prior workflow confirmed that every existing step remains.
- Habit Hooks passed with an empty snooze file. Independent review found no
  weakened assertions or missing CI checks.
- The macOS host cannot execute the Windows-only test or reproduce the hosted
  Ubuntu runner's network. The updated PR checks verify those environments.

Local logs are in `reports/ci-stack-fixes/`. Use the checks on
[BV-04](https://github.com/tomer-mayara/choom/pull/21),
[BV-05](https://github.com/tomer-mayara/choom/pull/22),
[BV-06](https://github.com/tomer-mayara/choom/pull/23), and
[BV-07](https://github.com/tomer-mayara/choom/pull/24) for current hosted results.
