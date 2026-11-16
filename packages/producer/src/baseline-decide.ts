import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import * as yaml from 'yaml';
import { baselineSchema } from '@choom/baseline-model';
import { nextBaselineVersion, type SavedBaseline } from '@choom/baseline-model/baseline-decisions';
import type { BaselineDecider, BaselineDecisions } from '@choom/baseline-model/contracts';
import { type CompletedRun, readCompletedRun, readRegisteredFile } from './completed-run.ts';
import { checkDecider, runModelCalls } from './decider-check.ts';
import { checkDecisionFileSize, decisionRecordPath, parseDecisionYaml, saveDecisionRecord } from './decision-record.ts';
import { nextVersionText } from './next-version-checks.ts';
import { assert, hash } from './record-checks.ts';
import { pathsOverlap } from './run-layout.mjs';
import { readBaselineYaml } from './stage-6-records.ts';

// The decide action of the baseline command. It records the human decisions of a
// YAML decision file for the published baseline of a run that Stage 6 completed.
// It reads the file with the producer's bounded YAML profile, checks it with the
// shared rules of @choom/baseline-model and checks the decider against the run's
// LLM call records. It also checks the next version that baseline next makes from
// the saved record, with the checks of baseline next. Then it saves the exact
// bytes of the file once, as decisions/<ID>.yaml in the run folder. It changes no
// other file: the baseline, the discovery result and run.yaml stay as they are.

export interface RecordedDecisions {
  status: 'decisions-recorded';
  id: string;
  // The saved decision record, relative to the run folder, and the SHA-256 of its bytes.
  path: string;
  sha256: string;
  baselineRef: string;
  baselineDigest: string;
  decider: BaselineDecider;
  decidedAt: string;
  statements: { action: string; statement: string }[];
  deciderCheck: { llmCallRecords: string[]; models: string[] };
  limits: string[];
  writes: string[];
}

const baselineLimit = 16 * 1024 * 1024;
const limits = [
  'The decider check compares the decider name with the model names in the LLM call records of the run. ' +
    'It is a process rule: it does not prove that a person made the decisions.',
  'Recording decisions does not change the baseline, the discovery result or another file of the run.',
];

function refuse(problems: readonly string[]): never {
  throw new Error('The decisions are refused:\n' + problems.map(problem => '- ' + problem).join('\n'));
}

// The decision file is a YAML file outside the run folder. The size check comes
// before the file is read.
function readDecisionFile(run: CompletedRun, path: string): { bytes: Buffer; value: unknown } {
  assert(lstatSync(path, { throwIfNoEntry: false }) !== undefined, 'The decision file does not exist: ' + path);
  const file = realpathSync(path);
  const entry = lstatSync(file);
  assert(entry.isFile(), 'The decision file is not a regular file: ' + path);
  assert(!pathsOverlap(run.folder, file), 'Keep the decision file outside the run folder. The command saves its copy in decisions/.');
  checkDecisionFileSize(entry.size);
  const bytes = readFileSync(file);
  return { bytes, value: parseDecisionYaml(bytes) };
}

// The published baseline after the checks of its registered digest, the bounded
// YAML profile and the shared baseline rules. Its digest is the SHA-256 of the
// saved file bytes, which Stage 6 registered in run.yaml.
export function publishedBaseline(run: CompletedRun): SavedBaseline {
  const parsed = baselineSchema.safeParse(readBaselineYaml(readRegisteredFile(run, run.baseline, baselineLimit), yaml));
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    throw new Error(`The published baseline ${run.baseline.path} does not pass the shared baseline rules` +
      (issue ? ` at ${issue.path.map(String).join('.')}: ${issue.message}` : '.'));
  }
  return { baseline: parsed.data, sha256: run.baseline.sha256 };
}

function recordedOutput(decisions: BaselineDecisions, path: string, bytes: Buffer, calls: { path: string; model: string }[]):
  RecordedDecisions {
  return { status: 'decisions-recorded', id: decisions.id, path, sha256: hash(bytes), baselineRef: decisions.baselineRef,
    baselineDigest: decisions.baselineDigest, decider: decisions.decider, decidedAt: decisions.decidedAt,
    statements: decisions.entries.map(({ action, itemId, field }) => ({ action, statement: `${itemId}.${field}` })),
    deciderCheck: { llmCallRecords: calls.map(call => call.path), models: [...new Set(calls.map(call => call.model))] },
    limits, writes: [path] };
}

export function recordDecisions(runFolder: string, decisionFile: string): RecordedDecisions {
  const run = readCompletedRun(runFolder);
  const { bytes, value } = readDecisionFile(run, decisionFile);
  const made = nextBaselineVersion(publishedBaseline(run), value);
  if (made.status === 'invalid') refuse(made.problems);
  const { baseline: version, decisions } = made;
  const calls = runModelCalls(run);
  try {
    checkDecider(decisions.decider.name, calls);
  } catch (error) {
    refuse([(error as Error).message]);
  }
  // The record that baseline next reads has these bytes, at this path.
  const sha256 = hash(bytes);
  nextVersionText(version, { link: { id: decisions.id, path: decisionRecordPath(decisions.id), sha256 }, saved: { sha256, decisions } },
    refuse);
  return recordedOutput(decisions, saveDecisionRecord(run, decisions.id, bytes), bytes, calls);
}
