import { spawnSync } from 'node:child_process';
import { assert } from './record-checks.ts';

// The ripgrep program of the tool checkout. @vscode/ripgrep installs it from a
// package for each platform, so the install runs no script. ripgrep reads a
// configuration file only when RIPGREP_CONFIG_PATH names one, so each call
// removes that variable.
const versionTimeoutMs = 10_000;

// The outcome of one ripgrep call. errorCode is ENOBUFS when the output passed the
// byte limit and ETIMEDOUT when the call passed the time limit; ripgrep is then stopped.
export interface RipgrepRun {
  exitCode: number | null; signal: string | null; errorCode: string | null; errorMessage: string | null;
  stdout: Buffer; stderr: Buffer;
}
export interface RipgrepBounds { maxOutputBytes: number; timeoutMs: number }

// The environment of a ripgrep call: the caller's environment without RIPGREP_CONFIG_PATH.
export function ripgrepEnvironment(environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const { RIPGREP_CONFIG_PATH: _configuration, ...kept } = environment;
  return kept;
}

// The first line of `rg --version`, such as "ripgrep 15.0.0 (rev 3a612f88b8)".
// The other lines name the processor features of this computer.
export function ripgrepVersion(program: string): string {
  const result = spawnSync(program, ['--version'], { encoding: 'utf8', env: ripgrepEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'], timeout: versionTimeoutMs });
  const version = result.error || result.status !== 0 ? '' : result.stdout.split('\n')[0] ?? '';
  assert(/^ripgrep \d+\.\d+\.\d+\b/.test(version), program + ' --version does not report a ripgrep version.');
  return version;
}

// Runs ripgrep in a folder with no input, within the byte and time limits.
export function runRipgrep(program: string, args: readonly string[], folder: string, bounds: RipgrepBounds): RipgrepRun {
  const result = spawnSync(program, args, { cwd: folder, env: ripgrepEnvironment(), stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: bounds.maxOutputBytes, timeout: bounds.timeoutMs, windowsHide: true });
  const error = result.error as NodeJS.ErrnoException | undefined;
  return { exitCode: result.status, signal: result.signal, errorCode: error?.code ?? null, errorMessage: error?.message ?? null,
    stdout: result.stdout ?? Buffer.alloc(0), stderr: result.stderr ?? Buffer.alloc(0) };
}
