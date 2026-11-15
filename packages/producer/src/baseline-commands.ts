import { recordDecisions } from './baseline-decide.ts';
import { makeNextVersion } from './baseline-next.ts';

// The baseline command of the producer. Its decide action records the human
// decisions of a decision file for the published baseline of a run that Stage 6
// completed. Its next action makes the next baseline version from a saved
// decision record. Each action prints its record as JSON. A refusal prints its
// reason and ends with exit code 1.
const usage = 'Use baseline decide --run RUN_FOLDER DECISION_FILE, or baseline next --run RUN_FOLDER --decisions DECISION_ID.';

// The run folder after --run, and one decision file.
function decideArguments(args: readonly string[]): { run: string; file: string } {
  const at = args.indexOf('--run');
  const run = at < 0 ? undefined : args[at + 1];
  const rest = at < 0 ? args : [...args.slice(0, at), ...args.slice(at + 2)];
  const [file] = rest;
  if (run === undefined || run.startsWith('--') || rest.length !== 1 || file === undefined || file.startsWith('--'))
    throw new Error(usage);
  return { run, file };
}

// The run folder after --run and the decision record ID after --decisions, in either order.
function nextArguments(args: readonly string[]): { run: string; decisions: string } {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const [flag = '', value] = [args[index], args[index + 1]];
    if (!['--run', '--decisions'].includes(flag) || values.has(flag) || value === undefined || value.startsWith('--'))
      throw new Error(usage);
    values.set(flag, value);
  }
  const [run, decisions] = [values.get('--run'), values.get('--decisions')];
  if (run === undefined || decisions === undefined) throw new Error(usage);
  return { run, decisions };
}

function result([action, ...args]: readonly string[]): unknown {
  if (action === 'decide') {
    const { run, file } = decideArguments(args);
    return recordDecisions(run, file);
  }
  if (action === 'next') {
    const { run, decisions } = nextArguments(args);
    return makeNextVersion(run, decisions);
  }
  throw new Error(usage);
}

try {
  process.stdout.write(JSON.stringify(result(process.argv.slice(2)), null, 2) + '\n');
} catch (error) {
  process.stderr.write((error as Error).message + '\n');
  process.exitCode = 1;
}
