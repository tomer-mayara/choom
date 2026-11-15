import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
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

function runProgram(program: string, args: readonly string[], settings: Record<string, string> = {}): CommandResult {
  const result = spawnSync(program, args, { encoding: "utf8", env: producerEnvironment(settings), timeout: 120_000 });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// Run a producer helper file as an operator does: node for JavaScript, python3 for Python.
export function runHelper(path: string, args: readonly string[] = [], settings: Record<string, string> = {}): CommandResult {
  return runProgram(path.endsWith(".py") ? "python3" : "node", [path, ...args], settings);
}

export function runCli(args: readonly string[], settings: Record<string, string> = {}): CommandResult {
  return runProgram("node", [join(producerSource, "cli.ts"), ...args], settings);
}

export function withScratch<T>(use: (scratch: string) => T): T {
  const scratch = mkdtempSync(join(realpathSync(tmpdir()), "choom-producer-"));
  try {
    return use(scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
