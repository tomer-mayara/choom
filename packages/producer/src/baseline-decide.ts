import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as yaml from 'yaml';
import { baselineSchema } from '@choom/baseline-model';
import { type SavedBaseline, validateDecisions } from '@choom/baseline-model/baseline-decisions';
import type { BaselineDecider, BaselineDecisions } from '@choom/baseline-model/contracts';
import { type CompletedRun, readCompletedRun, readRegisteredFile } from './completed-run.ts';
import { checkDecider, runModelCalls } from './decider-check.ts';
import { assert, hash } from './record-checks.ts';
import { pathsOverlap } from './run-layout.mjs';
import { readBaselineYaml } from './stage-6-records.ts';

// The decide action of the baseline command. It records the human decisions of a
// decision file for the published baseline of a run that Stage 6 completed. It
// checks the file with the shared rules of @choom/baseline-model and checks the
// decider against the run's LLM call records. Then it saves the exact bytes of the
// file once, as decisions/<ID>.json in the run folder. It changes no other file:
// the baseline, the discovery result and run.yaml stay as they are.

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

const fileLimit = 16 * 1024 * 1024;
const limits = [
  'The decider check compares the decider name with the model names in the LLM call records of the run. ' +
    'It is a process rule: it does not prove that a person made the decisions.',
  'Recording decisions does not change the baseline, the discovery result or another file of the run.',
];

function refuse(problems: readonly string[]): never {
  throw new Error('The decisions are refused:\n' + problems.map(problem => '- ' + problem).join('\n'));
}

// The decision file is UTF-8 JSON of at most 16 MiB, outside the run folder.
function readDecisionFile(run: CompletedRun, path: string): { bytes: Buffer; value: unknown } {
  assert(lstatSync(path, { throwIfNoEntry: false }) !== undefined, 'The decision file does not exist: ' + path);
  const file = realpathSync(path);
  assert(!pathsOverlap(run.folder, file), 'Keep the decision file outside the run folder. The command saves its copy in decisions/.');
  const entry = lstatSync(file);
  assert(entry.isFile(), 'The decision file is not a regular file: ' + path);
  assert(entry.size <= fileLimit, 'The decision file is larger than 16 MiB.');
  const bytes = readFileSync(file);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('The decision file is not UTF-8 text.');
  }
  try {
    return { bytes, value: JSON.parse(text) };
  } catch (error) {
    throw new Error('The decision file is not valid JSON: ' + (error as Error).message);
  }
}

// The published baseline after the checks of its registered digest, the bounded
// YAML profile and the shared baseline rules. Its digest is the SHA-256 of the
// saved file bytes, which Stage 6 registered in run.yaml.
function publishedBaseline(run: CompletedRun): SavedBaseline {
  const parsed = baselineSchema.safeParse(readBaselineYaml(readRegisteredFile(run, run.baseline, fileLimit), yaml));
  assert(parsed.success, `The published baseline ${run.baseline.path} does not pass the shared baseline rules.`);
  return { baseline: parsed.data, sha256: run.baseline.sha256 };
}

// Saves the bytes once. A record with the same ID is never replaced, also when
// the content is the same.
function saveRecord(run: CompletedRun, id: string, bytes: Buffer): string {
  const folder = join(run.folder, 'decisions');
  if (lstatSync(folder, { throwIfNoEntry: false }) === undefined) mkdirSync(folder, { recursive: true });
  assert(lstatSync(folder).isDirectory(), 'decisions in the run folder is not a folder.');
  const path = `decisions/${id}.json`;
  try {
    writeFileSync(join(run.folder, path), bytes, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    throw new Error(`The decision record ${id} is saved already: ${path}. A saved decision record does not change. ` +
      'Give new decisions a new ID.');
  }
  assert(hash(readFileSync(join(run.folder, path))) === hash(bytes), 'The saved decision record changed while it was saved: ' + path);
  return path;
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
  const check = validateDecisions(value, publishedBaseline(run));
  if (check.status === 'invalid') refuse(check.problems);
  const calls = runModelCalls(run);
  try {
    checkDecider(check.decisions.decider.name, calls);
  } catch (error) {
    refuse([(error as Error).message]);
  }
  return recordedOutput(check.decisions, saveRecord(run, check.decisions.id, bytes), bytes, calls);
}
