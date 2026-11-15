import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface CommandResult { status: number | null; stdout: string; stderr: string }

export const toolsRoot = realpathSync(fileURLToPath(new URL("../../../../", import.meta.url)));
export const producerSource = join(toolsRoot, "packages/producer/src");
export const producerDocuments = join(toolsRoot, "docs/design/app-a");

// Start each command with the caller's environment minus any producer settings,
// so a developer's own CHOOM_* or KNIP_* values cannot change a result.
function producerEnvironment(settings: Record<string, string> = {}): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && !/^(CHOOM|KNIP)_/.test(name)) environment[name] = value;
  }
  return { ...environment, ...settings };
}

const defaultTimeout = 120_000;

function runProgram(program: string, args: readonly string[], settings: Record<string, string> = {},
  timeout = defaultTimeout): CommandResult {
  const result = spawnSync(program, args, { encoding: "utf8", env: producerEnvironment(settings), timeout });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// Run a producer helper file as an operator does: node for JavaScript, python3 for Python.
export function runHelper(path: string, args: readonly string[] = [], settings: Record<string, string> = {},
  timeout = defaultTimeout): CommandResult {
  return runProgram(path.endsWith(".py") ? "python3" : "node", [path, ...args], settings, timeout);
}

// Run the command line of a tool checkout: this checkout, or a copy made by a test.
export function runCli(args: readonly string[], settings: Record<string, string> = {}, tools = toolsRoot): CommandResult {
  return runProgram("node", [join(tools, "packages/producer/src/cli.ts"), ...args], settings);
}

// The inventory view makes its input copies read-only. Make every folder
// writable again so that a user without root rights can remove the scratch folder.
function makeFoldersWritable(folder: string): void {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    chmodSync(join(folder, entry.name), 0o700);
    makeFoldersWritable(join(folder, entry.name));
  }
}

export function removeScratch(scratch: string): void {
  makeFoldersWritable(scratch);
  rmSync(scratch, { recursive: true, force: true });
}

export function makeScratch(): string {
  return mkdtempSync(join(realpathSync(tmpdir()), "choom-producer-"));
}

export function withScratch<T>(use: (scratch: string) => T): T {
  const scratch = makeScratch();
  try {
    return use(scratch);
  } finally {
    removeScratch(scratch);
  }
}
