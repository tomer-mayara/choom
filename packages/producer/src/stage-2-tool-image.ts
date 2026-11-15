import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { constants } from 'node:os';
import { join } from 'node:path';

// The Stage 2 toolchain action runs the copy of this module that start saved in
// the attempt, only when the preflight is eligible and a docker command exists.
// It builds the Knip tool image from a Dockerfile with an empty build context,
// resolves the image ID, and checks the image with the saved check-knip-image.mjs
// fixture. Each step saves its output and exit code under toolchain/. A failed
// build, inspection or check is recorded, and the driver then selects no image.
const { CHOOM_STAGE2: attempt = '', CHOOM_STAGE2_ID: id = '' } = process.env;
const toolchain = join(attempt, 'toolchain');
const dockerfile = 'FROM node:24-bookworm-slim\nWORKDIR /opt/choom-tools\n' +
  'RUN npm init -y && npm install --ignore-scripts --save-exact knip@6.44.1\nUSER 65534:65534\nWORKDIR /repo\n';
const record = (name: string, text: string): void => writeFileSync(join(toolchain, name), text, { flag: 'wx' });

// The exit status that a shell reports for a finished or failed command.
function status(result: SpawnSyncReturns<Buffer>): number {
  if (result.error) return (result.error as NodeJS.ErrnoException).code === 'ENOENT' ? 127 : 126;
  if (result.signal) return 128 + (constants.signals[result.signal] ?? 0);
  return result.status ?? 1;
}

// Runs docker with standard input from a file, or none, and output to new files.
function docker(args: string[], input: string | null, stdout: string, stderr?: string): number {
  const inputFd = input === null ? 'inherit' : openSync(input, 'r');
  const outputFd = openSync(stdout, 'wx');
  const errorFd = stderr === undefined ? 'inherit' : openSync(stderr, 'wx');
  try {
    return status(spawnSync('docker', args, { stdio: [inputFd, outputFd, errorFd] }));
  } finally {
    for (const fd of [inputFd, outputFd, errorFd]) if (typeof fd === 'number') closeSync(fd);
  }
}

// Reads a saved file as a shell command substitution does: without trailing new lines.
function substitute(path: string): string {
  if (existsSync(path)) return readFileSync(path, 'utf8').replace(/\n+$/, '');
  process.stderr.write(`cat: ${path}: No such file or directory\n`);
  return '';
}

function buildImage(): string {
  let image = process.env.CHOOM_KNIP_IMAGE ?? '';
  mkdirSync(toolchain);
  const version = docker(['--version'], null, join(toolchain, 'docker-version.txt'));
  if (version !== 0) process.exit(version);
  record('Dockerfile', dockerfile);
  const build = docker(['build', '--progress=plain', '--iidfile', join(toolchain, 'build-image-id.txt'), '-'],
    join(toolchain, 'Dockerfile'), join(toolchain, 'build.stdout.txt'), join(toolchain, 'build.stderr.txt'));
  if (build !== 0) {
    record('build-exit.txt', `${build}\n`);
    process.stdout.write('Tool image unavailable; continue with a skipped Knip outcome.\n');
    return image;
  }
  record('build-exit.txt', '0\n');
  const built = substitute(join(toolchain, 'build-image-id.txt'));
  const inspect = docker(['image', 'inspect', '--format', '{{.Id}}', built], null,
    join(toolchain, 'image-id.txt'), join(toolchain, 'image-inspect.stderr.txt'));
  if (inspect === 0) {
    record('image-inspect-exit.txt', '0\n');
    image = substitute(join(toolchain, 'image-id.txt'));
    process.env.CHOOM_KNIP_IMAGE = image;
  } else {
    record('image-inspect-exit.txt', `${inspect}\n`);
    process.stdout.write('Built image could not be resolved; leave the selected image empty.\n');
  }
  return image;
}

function checkImage(image: string): void {
  if (!image) return;
  const check = docker(['run', '--rm', '-i', '--pull=never', '--name', `choom-${id}-tool-check`,
    '--network', 'none', '--read-only', '--env', 'KNIP_DISABLE_RAW_TRANSFER=1',
    '--env', `CHOOM_KNIP_IMAGE_ID=${image}`,
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '65534:65534',
    '--pids-limit', '128', '--memory', '2g', '--memory-swap', '2g',
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=256m,mode=1777',
    '--entrypoint', 'node', image, '--input-type=module'],
  join(attempt, 'check-knip-image.mjs'), join(toolchain, 'metadata.json'), join(toolchain, 'check.stderr.txt'));
  if (check === 0) record('check-exit.txt', '0\n');
  else {
    record('check-exit.txt', `${check}\n`);
    process.stdout.write('Image check failed; continue with a skipped Knip outcome.\n');
  }
}

checkImage(buildImage());
