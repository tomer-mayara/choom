import { parse } from 'yaml';
import { type CompletedRun, readRegisteredFile } from './completed-run.ts';
import { object, text } from './record-checks.ts';

// The run check of a decision file, for the design rule "An LLM cannot accept
// its own proposal": the decider must not have the name of a model that worked
// on the run. The models are the `model` values of the run's LLM call records:
// each registered file under evidence/ whose name ends with -call.yaml. These are
// evidence/llm-call.yaml of Stage 1, and llm/plan-call.yaml and
// llm/analysis-call.yaml in the attempt folders of Stages 2 to 6. The check
// compares the names after it removes white space at their start and end and
// changes all letters to lower case. It is a process rule: it refuses a name that
// matches, but a name that does not match does not prove that a person decided.

export interface ModelCall {
  // The call record, relative to the run folder.
  readonly path: string;
  readonly model: string;
}

const callRecord = /^evidence\/(?:.+\/)?[^/]+-call\.yaml$/;
const callRecordLimit = 1024 * 1024;

function readModel(run: CompletedRun, file: CompletedRun['files'][number]): string {
  const bytes = readRegisteredFile(run, file, callRecordLimit);
  let record: unknown;
  try {
    record = parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`Cannot read the LLM call record ${file.path}: ${(error as Error).message}`);
  }
  const model = object(record) ? record.model : undefined;
  if (!text(model)) throw new Error(`The LLM call record ${file.path} has no model value.`);
  return model;
}

// The model of each LLM call record that run.yaml registers, in the order of the registry.
export function runModelCalls(run: CompletedRun): ModelCall[] {
  return run.files.filter(file => callRecord.test(file.path)).map(file => ({ path: file.path, model: readModel(run, file) }));
}

const comparable = (name: string): string => name.trim().toLowerCase();

// Refuses a decider whose name is a model of the run. Without call records the
// check cannot run, so it refuses the run.
export function checkDecider(name: string, calls: readonly ModelCall[]): void {
  if (calls.length === 0) throw new Error('The run registers no LLM call records, so the decider cannot be compared with ' +
    'the models of the run. A run that Stage 6 completed has the call records of its stages.');
  const match = calls.find(call => comparable(call.model) === comparable(name));
  if (match) throw new Error(`The decider ${JSON.stringify(name)} is the model ${JSON.stringify(match.model)} of the LLM call ` +
    `record ${match.path}. A model cannot accept or correct statements. Name the person who made the decisions.`);
}
