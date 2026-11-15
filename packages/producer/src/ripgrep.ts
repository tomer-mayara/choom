import { spawnSync } from 'node:child_process';
import { assert } from './record-checks.ts';

// The ripgrep program of the tool checkout. @vscode/ripgrep installs it from a
// package for each platform, so the install runs no script. ripgrep reads a
// configuration file only when RIPGREP_CONFIG_PATH names one, so each call
// removes that variable.
const versionTimeoutMs = 10_000;

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
