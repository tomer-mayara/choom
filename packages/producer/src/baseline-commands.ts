import { recordDecisions } from './baseline-decide.ts';

// The baseline command of the producer. Its decide action records the human
// decisions of a decision file for the published baseline of a run that Stage 6
// completed, and prints the record as JSON. A refusal prints its reason and ends
// with exit code 1.
const usage = 'Use baseline decide --run RUN_FOLDER DECISION_FILE.';

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

function main([action, ...args]: readonly string[]): void {
  if (action !== 'decide') throw new Error(usage);
  const { run, file } = decideArguments(args);
  process.stdout.write(JSON.stringify(recordDecisions(run, file), null, 2) + '\n');
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write((error as Error).message + '\n');
  process.exitCode = 1;
}
