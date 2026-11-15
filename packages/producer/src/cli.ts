import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// One command line for the producer helpers that run from the tool checkout.
// It starts the helper with the same arguments, environment and terminal and
// exits with the helper's exit code. The helper keeps all producer behavior.

interface ProducerCommand {
  readonly helper: string;
  readonly use: string;
}

export interface HelperCall {
  readonly program: string;
  readonly args: readonly string[];
}

export const producerCommands: ReadonlyMap<string, ProducerCommand> = new Map([
  ["stage-1", { helper: "stage-1-commands.ts", use: "Capture the snapshot and review its settings." }],
  ["stage-2", { helper: "stage-2-commands.ts", use: "Run the entry analysis." }],
  ["stage-2-consolidate", { helper: "stage-2-consolidate-inputs.ts", use: "Merge earlier per-attempt Knip inputs into the shared input." }],
  ["stage-3", { helper: "stage-3-commands.mjs", use: "Run the loading and symbol search." }],
  ["stage-3-finish", { helper: "stage-3-finish.ts", use: "Save or verify the Stage 3 review." }],
  ["stage-4", { helper: "stage-4-commands.ts", use: "Prepare the component recovery and its dependency graph." }],
  ["stage-4-inspect", { helper: "stage-4-inspect.mjs", use: "Collect the Stage 4 source evidence and excerpts." }],
  ["stage-4-5-publish", { helper: "stage-4-5-publish.ts", use: "Check, publish or verify a Stage 4 or Stage 5 review." }],
  ["stage-5", { helper: "stage-5-commands.mjs", use: "Collect and review the remaining code." }],
  ["stage-6", { helper: "stage-6-commands.mjs", use: "Save and verify the fixed baseline and discovery result." }],
  ["duplication", { helper: "duplication-commands.mjs", use: "Run the separate duplication assessment." }],
  ["recover-capture", { helper: "recover-capture.ts", use: "Recover inputs from a damaged earlier capture." }],
  ["inventory-view", { helper: "inventory-view.py", use: "Prepare, verify or consolidate inventory-only input copies." }],
]);

const helperFolder = fileURLToPath(new URL(".", import.meta.url));
const helpRequests = new Set(["help", "--help", "-h"]);

// Returns the process that runs a known command, or undefined for an unknown command.
export function helperCall(argv: readonly string[], node: string = process.execPath): HelperCall | undefined {
  const [name, ...args] = argv;
  const command = name === undefined ? undefined : producerCommands.get(name);
  if (command === undefined) return undefined;
  const helper = join(helperFolder, command.helper);
  return command.helper.endsWith(".py") ? { program: "python3", args: [helper, ...args] } : { program: node, args: [helper, ...args] };
}

export function usage(): string {
  const width = Math.max(...[...producerCommands.keys()].map((name) => name.length));
  const lines = [...producerCommands].map(([name, { helper, use }]) => `  ${name.padEnd(width)}  ${use} (${helper})`);
  return [
    "Usage: producer <command> [action] [arguments...]",
    "",
    "Runs a producer helper from this tool checkout with the same arguments,",
    "environment and terminal, and exits with its exit code.",
    "",
    "Commands:",
    ...lines,
    "",
    "Each stage action after Stage 1 start first checks that the producer code is",
    "the code that started the run. The stage cookbooks in docs/design/app-a give",
    "each command.",
    "",
  ].join("\n");
}

function main(argv: readonly string[]): number {
  if (argv[0] !== undefined && helpRequests.has(argv[0])) {
    process.stdout.write(usage());
    return 0;
  }
  const call = helperCall(argv);
  if (call === undefined) {
    process.stderr.write((argv[0] === undefined ? "" : `Unknown producer command: ${argv[0]}\n\n`) + usage());
    return 1;
  }
  const result = spawnSync(call.program, call.args, { stdio: "inherit" });
  if (result.error) {
    process.stderr.write(`Cannot run ${call.program}: ${result.error.message}\n`);
    return 1;
  }
  // End with the same signal as the helper, so a caller sees the same outcome.
  if (result.signal) process.kill(process.pid, result.signal);
  return result.status ?? 1;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
