#!/usr/bin/env bash
set -u
set -o pipefail

usage() {
  cat <<'HELP'
Usage: scripts/run_all_constraints.sh

Run the implemented behavioral, observability, architectural, and interface
checks locally, without an LLM. All checks run even if an earlier check fails.
Install the pinned Bun/Node versions, run bun install --frozen-lockfile, and
install Chromium with bunx --no-install playwright install chromium first.

Logs are kept in reports/constraints/. Exit codes: 0 passed, 1 checks failed,
2 setup/usage error, 130 interrupted, 143 terminated.
Production SLO measurement and packaged native acceptance remain unimplemented.
HELP
}

if [ "$#" -gt 0 ]; then
  if [ "$#" -eq 1 ] && [ "$1" = "--help" ]; then
    usage
    exit 0
  fi
  usage >&2
  exit 2
fi

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd) || exit 2
cd -- "$repo_root" || exit 2

bold='' green='' red='' reset=''
if [ -t 1 ] && [ -z "${NO_COLOR+x}" ] && [ "${TERM:-dumb}" != dumb ]; then
  bold=$'\033[1m' green=$'\033[32m' red=$'\033[31m' reset=$'\033[0m'
fi

printf '%sChoom — four constraint checks%s\n' "$bold" "$reset"
printf 'Repository: %s\n' "$repo_root"
for tool in bun node; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf '%s[FAIL]%s Setup: %s is not on PATH. Install the pinned versions in README.md.\n' "$red" "$reset" "$tool" >&2
    exit 2
  fi
done
if [ ! -d node_modules ]; then
  printf '%s[FAIL]%s Setup: node_modules is missing. Run bun install --frozen-lockfile.\n' "$red" "$reset" >&2
  exit 2
fi

mkdir -p reports/constraints || exit 2
log_dir=$(mktemp -d "$repo_root/reports/constraints/run.XXXXXX") || exit 2
printf 'Tools: Bun %s; Node %s\nLogs: %s\n' "$(bun --version)" "$(node --version)" "$log_dir"

# Each command owns a process group, including Bun's script wrappers.
set -m
active_pid=''
cancel() {
  local signal="$1" exit_code="$2" attempt
  trap '' INT TERM
  printf '\n%s[CANCELLED]%s Received %s; stopping the active check.\n' "$red" "$reset" "$signal" >&2
  if [ -n "$active_pid" ]; then
    kill -s "$signal" -- "-$active_pid" 2>/dev/null || true
    for ((attempt = 0; attempt < 12; attempt++)); do
      kill -0 -- "-$active_pid" 2>/dev/null || break
      sleep 1
    done
    kill -KILL -- "-$active_pid" 2>/dev/null || true
    wait "$active_pid" 2>/dev/null || true
  fi
  printf 'Partial logs: %s\n' "$log_dir" >&2
  exit "$exit_code"
}
trap 'cancel INT 130' INT
trap 'cancel TERM 143' TERM

# Captured command logs stay readable in terminals, files, and CI.
unset FORCE_COLOR
export NO_COLOR=1
names=(Behavioral Observability Architectural Interface)
results=(PASS PASS PASS PASS)
failures=0
check_number=0

heading() {
  printf '\n%s[%s/4] %s%s\n' "$bold" "$(($1 + 1))" "${names[$1]}" "$reset"
}

check() {
  local group="$1" script="$2" purpose="$3" status started log
  check_number=$((check_number + 1))
  log="$log_dir/$check_number-${script//:/-}.log"
  started=$SECONDS
  printf '  RUN  %s\n       bun run %s\n' "$purpose" "$script"
  bun run "$script" >"$log" 2>&1 &
  active_pid=$!
  if wait "$active_pid"; then status=0; else status=$?; fi
  active_pid=''
  if [ "$status" -eq 0 ]; then
    printf '  %sPASS%s %s (%ss)\n' "$green" "$reset" "$purpose" "$((SECONDS - started))"
  else
    results[$group]=FAIL
    failures=$((failures + 1))
    printf '  %sFAIL%s %s — exit %s (%ss)\n' "$red" "$reset" "$purpose" "$status" "$((SECONDS - started))"
    printf '  Diagnostic output from bun run %s:\n' "$script"
    cat -- "$log"
    printf '  Full log: %s\n' "$log"
  fi
}

heading 0
check 0 test 'Native Bun and DOM unit behavior'
check 0 test:behavior 'Model and adapter Cucumber scenarios'
check 0 test:e2e 'Browser Cucumber scenarios and production build'
heading 1
check 1 check:cookbook 'Component links and OpenSLO Service shape'
heading 2
check 2 check:dependencies 'TypeScript dependency boundaries'
heading 3
check 3 check:contracts 'TypeSpec contracts, generated outputs, and runtime conformance'

printf '\n%sSummary%s\n' "$bold" "$reset"
for ((group = 0; group < 4; group++)); do
  color="$green"
  [ "${results[$group]}" = PASS ] || color="$red"
  printf '  %-15s %s%s%s\n' "${names[$group]}" "$color" "${results[$group]}" "$reset"
done
printf '\nRemaining gaps: production SLIs/SLOs are unmeasured; packaged native\nacceptance is not covered. Native compilation/configuration runs in separate\ndesktop CI. See cookbook/TODO.md. No LLM is invoked by this runner.\n'
printf '\nLogs: %s\n' "$log_dir"
if [ "$failures" -gt 0 ]; then
  printf '%sFAIL%s — %s check(s) failed; see the diagnostics above.\n' "$red" "$reset" "$failures"
  exit 1
fi
printf '%sPASS%s — all four configured constraint groups passed.\n' "$green" "$reset"
