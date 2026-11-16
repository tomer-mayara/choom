# First real run: Step 1 on Choom

This runbook adds to [Start here](start-here.md). It does not repeat the stage
commands. Follow Start here for the environment, the six stages, the reviews and
the hand-off. This page says only what is special about this run.

The owner decided on 2026-11-16 to make one real Step 1 run before Step 2 (the
[Step 1 report](../../architecture-reviews/2026-11-15-step-1-gap-surplus-report.md),
plan change 20). The run has two purposes:

1. Show whether the manual producer completes on a real codebase.
2. Rank the open items of the report with evidence instead of guesses.

## Who does what

- **A Claude Code session on the owner's computer** is the LLM manager of Start
  here. It runs every stage command and writes every LLM record.
- **The owner** decides. After the run, the owner opens the baseline in the
  viewer and accepts or corrects the proposed statements.

## Before you start

- The computer needs a working Docker engine, Git, Node 26.13.0 and Bun 1.4.4.
  The versions are pinned in `.node-version` and `.bun-version`. Docker must
  build images with normal network access to Docker Hub and the npm registry.
- Clone the repository and check out the commit of `main` that holds this page.
  Record its SHA in the journal. Do not change `packages/producer/src` or
  `packages/baseline-model/src` in this checkout: each stage refuses a run after
  a change to the producer code (GA-00e).
- Choom is both the tools and the target. Use the layout that Start here gives
  for that case:

  ```bash
  export CHOOM_TOOLS="$PWD"
  export CHOOM_TARGET="$PWD"
  export CHOOM_WORK="$CHOOM_TOOLS/work-choom/choom-run-001"
  export CHOOM_RUN_ID="choom-run-001"
  export CHOOM_SNAPSHOT_ID="choom-snapshot-001"
  export CHOOM_BASELINE_ID="choom-baseline-001"
  ```

  Stage 1 leaves `work-choom/` out of the snapshot.
- Start Stage 1 with a clean working tree (`git status` shows nothing), so that
  the snapshot is the recorded commit.

## Run the stages

Follow [Run the six stages](start-here.md#run-the-six-stages) to the end, up to
Stage 6 `verify`. Keep `progress.md` current, as
[Keep the progress report current](start-here.md#keep-the-progress-report-current)
says.

## Keep a run journal

Use `$CHOOM_WORK/run-takeaways.md` as the journal. Start here already names this
file for detailed lessons. Fill these sections while the run goes on, not at the
end. Each entry names the stage, the action and the attempt, and links the saved
file that shows it.

1. **Refusals and problems.** The exact message, and what you did next.
2. **Settings files (review finding D5).** From Stage 2 `preflight.json`: each
   copied plugin pattern that matches a settings file, and each pattern that was
   left out although it names an entry.
3. **Entry candidates that the LLM wrote (P8).** Each candidate whose cited
   evidence does not show its path or expression.
4. **Deferrals and unused files (P9, P10).** Each deferral gap, its reason, and
   whether the files that Knip reported as unused were looked at first.
5. **Prompts and evidence (P7).** A saved prompt that differs from the prompt
   that its stage generated. Cited evidence that was not in the supplied
   evidence.
6. **Other limits.** Each limit of the report's "Open after the final review"
   that the run hits, by its name in the report.
7. **Size and time.** The start and end time of each stage, the number of files
   in the snapshot, and the numbers of components, interfaces, questions and
   gaps in the result.

## When something goes wrong

- **A problem that does not block the run:** record it in the journal and
  continue.
- **A stage that still refuses after the retries that its cookbook allows:**
  1. Record the refusal in the journal.
  2. Fix the producer on a new branch from the recorded commit, with a failing
     test first, as `AGENTS.md` says. Open a draft PR for the fix.
  3. Start a new run from Stage 1 on the fixed commit, with the next run ID
     (`choom-run-002`). Keep the earlier run folder: it is evidence.
- **After two new runs,** record the remaining problem and stop.

## Hand off

1. Make a branch `run/choom-step-1` from the recorded commit. Add each run folder
   with `git add -f work-choom/<run>` (the folder is ignored), commit and push.
   This branch never merges into `main`.
2. Tell the owner the branch name, the journal path and the run that completed,
   if one did.
3. The owner opens `baselines/<baseline ID>/baseline.yaml` of that run in the
   viewer and attaches its `discovery.yaml` (see
   [Discovery questions and gaps](../../../README.md#discovery-questions-and-gaps)).
   For each proposed statement, **Copy decision** gives a decision entry. The
   owner saves the entries in a decision file. `baseline decide` records it, and
   `baseline next` makes the next baseline version from it (see
   [Decision record](record-format.md#decision-record)).
