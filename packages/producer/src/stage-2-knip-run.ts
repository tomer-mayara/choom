import { closeSync, createReadStream, openSync } from 'node:fs';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { isAbsolute, join, resolve, sep } from 'node:path';
import type { RequiredGaps } from './generated/contracts.ts';
import { ToolGaps } from './tool-gaps.ts';

// The Stage 2 run action runs this module in the tool checkout. It runs Knip on the inventory-only input in normal and production
// mode, each in a container with no network, and saves raw output and receipts.
// A missing image, an unsupported profile or a failed check gives skipped runs.
// Each command result names its saved stdout and stderr files with their SHA-256, so
// finish refuses an output that changed after the run. Last, it saves the gaps that
// the unsupported preflight and the skipped or failed runs require in required-gaps.json.
interface CommandResult {
  command: string; args: string[]; startedAt: string; finishedAt: string | null; exitCode: number | null;
  signal: string | null; timedOut: boolean; errors: string[]; stdout: string; stderr: string;
  stdoutSha256: string | null; stderrSha256: string | null;
}
interface DockerEndpoint { selector: string; context: string | null; endpoint: string | null; check: CommandResult | null }
interface Receipt {
  formatVersion: number; snapshotRef: string; profileRef: string; preflightRef: string; inputDigests: Record<string, string>;
  imageId: string | null; imageCheck: CommandResult | null; runs: object[]; limits: typeof limits; dockerEndpoint: DockerEndpoint;
  imageFixture?: object; inputView?: Record<string, unknown>;
}

const limits = {
  runTimeoutMs: 300_000,
  inputCheckTimeoutMs: 300_000,
  controlTimeoutMs: 15_000,
  maxReportBytes: 64 * 1024 * 1024,
  memory: '2g', pids: 128, tmpfs: '256m',
  network: 'none', readOnly: true, user: '65534:65534',
  environment: { KNIP_DISABLE_RAW_TRANSFER: '1' },
};
for (const key of ['CHOOM_WORK', 'CHOOM_STAGE2', 'CHOOM_TOOLS']) {
  if (!process.env[key] || !isAbsolute(process.env[key] ?? ''))
    throw new Error(`${key} must be an existing absolute directory.`);
}
const work = await realpath(process.env.CHOOM_WORK as string);
const attempt = await realpath(process.env.CHOOM_STAGE2 as string);
const inventoryView = join(await realpath(process.env.CHOOM_TOOLS as string), 'packages/producer/src/inventory-view.py');
const id = process.env.CHOOM_STAGE2_ID ?? '';
if (!id || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id))
  throw new Error('CHOOM_STAGE2_ID must contain only letters, digits, hyphens, or underscores.');
const readJson = async (name: string) => JSON.parse(await readFile(join(attempt, name), 'utf8'));
const planBytes = await readFile(join(attempt, 'entry-plan.json'));
const preflightBytes = await readFile(join(attempt, 'preflight.json'));
const plan = JSON.parse(planBytes.toString());
const preflight = JSON.parse(preflightBytes.toString());
if (plan.formatVersion !== 1 || typeof plan.snapshotRef !== 'string' || !plan.snapshotRef ||
    typeof plan.runProduction !== 'boolean' || typeof plan.productionReason !== 'string' ||
    preflight.formatVersion !== 1 || preflight.snapshotRef !== plan.snapshotRef ||
    preflight.knipVersion !== '6.44.1' || preflight.environment?.KNIP_DISABLE_RAW_TRANSFER !== '1' ||
    !['eligible', 'unsupported'].includes(preflight.status) ||
    !Array.isArray(preflight.reasons) || !preflight.reasons.every((value: unknown) => typeof value === 'string'))
  throw new Error('Invalid or mismatched plan/preflight. Correct the inputs before running.');

const hash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
if (!preflight.inventory || typeof preflight.inventory.path !== 'string' || isAbsolute(preflight.inventory.path) ||
    ![preflight.planSha256, preflight.profileSha256, preflight.inventory.sha256].every(value =>
      typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)))
  throw new Error('Preflight must contain the plan, profile, and inventory digests.');
const inventoryPath = await realpath(resolve(work, preflight.inventory.path));
if (!inventoryPath.startsWith(work + sep)) throw new Error('Inventory path is outside CHOOM_WORK.');
const inputDigests = {
  planSha256: hash(planBytes), preflightSha256: hash(preflightBytes),
  profileSha256: hash(await readFile(join(attempt, 'knip-profile.json'))),
  inventorySha256: hash(await readFile(inventoryPath)),
};
if (inputDigests.planSha256 !== preflight.planSha256 || inputDigests.profileSha256 !== preflight.profileSha256 ||
    inputDigests.inventorySha256 !== preflight.inventory.sha256)
  throw new Error('Plan, profile, or inventory changed after preflight. Use a new attempt.');

// Do not replace a prior attempt's receipts or raw output.
const receiptPath = join(attempt, 'knip-runs.json');
try {
  await stat(receiptPath);
  throw new Error('knip-runs.json already exists. Use a new attempt ID and folder.');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const imageId = process.env.CHOOM_KNIP_IMAGE || null;
const dockerContext = process.env.DOCKER_CONTEXT || null;
const dockerHost = process.env.DOCKER_HOST || null;
const selector = dockerContext ? `DOCKER_CONTEXT=${dockerContext}` : dockerHost ? `DOCKER_HOST=${dockerHost}` : 'current-context';
let selectedEndpoint: string | null = null;
const receipt: Receipt = {
  formatVersion: 1, snapshotRef: plan.snapshotRef,
  profileRef: `${id}-knip-profile`, preflightRef: `${id}-preflight`,
  inputDigests, imageId, imageCheck: null, runs: [], limits,
  dockerEndpoint: { selector, context: dockerContext, endpoint: null, check: null },
};

// The SHA-256 of a saved output file, read in parts so that a large report stays on disk.
async function savedDigest(name: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(join(attempt, name))) digest.update(chunk as Buffer);
  return digest.digest('hex');
}

// Numeric file descriptors keep raw output on disk without buffering it in memory.
async function command(program: string, args: string[], stem: string, timeoutMs: number): Promise<CommandResult> {
  if (program === 'docker' && selectedEndpoint) args = ['--host', selectedEndpoint, ...args];
  const stdout = `${stem}.stdout.txt`;
  const stderr = `${stem}.stderr.txt`;
  const outputFd = openSync(join(attempt, stdout), 'wx');
  let errorFd: number;
  try { errorFd = openSync(join(attempt, stderr), 'wx'); }
  catch (error) { closeSync(outputFd); throw error; }
  const result: CommandResult = {
    command: program, args, startedAt: new Date().toISOString(), finishedAt: null,
    exitCode: null, signal: null, timedOut: false, errors: [], stdout, stderr, stdoutSha256: null, stderrSha256: null,
  };
  try {
    await new Promise<void>(resolve => {
      let child;
      try {
        child = spawn(program, args, { stdio: ['ignore', outputFd, errorFd],
          env: program === 'docker' && selectedEndpoint ? { ...process.env, DOCKER_CONTEXT: '' } : process.env });
      } catch (error) {
        const failure = error as NodeJS.ErrnoException;
        result.errors.push(`${failure.code || 'spawn'}: ${failure.message}`);
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        result.timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);
      child.on('error', (error: NodeJS.ErrnoException) => result.errors.push(`${error.code || 'spawn'}: ${error.message}`));
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        result.exitCode = code;
        result.signal = signal;
        resolve();
      });
    });
  } finally {
    closeSync(outputFd);
    closeSync(errorFd);
    result.finishedAt = new Date().toISOString();
  }
  result.stdoutSha256 = await savedDigest(stdout);
  result.stderrSha256 = await savedDigest(stderr);
  return result;
}
const docker = (args: string[], stem: string, timeoutMs: number): Promise<CommandResult> => command('docker', args, stem, timeoutMs);
function skipped(mode: string, reasons: string[]): object {
  return { mode, status: 'skipped', recordedAt: new Date().toISOString(), reasons,
    args: null, startedAt: null, finishedAt: null, exitCode: null, signal: null,
    stdout: null, stderr: null, cleanup: { status: 'not-needed' } };
}
const failed = (check: CommandResult): boolean => check.exitCode !== 0 || Boolean(check.signal) || check.timedOut ||
  check.errors.length > 0;

async function checkImageFixture(blockers: string[]): Promise<void> {
  try {
    const bytes = await readFile(join(attempt, 'toolchain/metadata.json'));
    const check = JSON.parse(bytes.toString());
    if (check.imageId !== imageId || check.knip !== '6.44.1' || !check.packageLock ||
        check.toolRoot !== '/opt/choom-tools' || check.environment?.KNIP_DISABLE_RAW_TRANSFER !== '1' ||
        check.check?.status !== 'passed' || check.check.runs?.length !== 2 ||
        !['normal', 'production'].every(mode => check.check.runs.some((run: { mode: string; exitCode: number }) =>
          run.mode === mode && run.exitCode === 1)))
      throw new Error('Image fixture did not pass both modes with the required parser setting.');
    receipt.imageFixture = { ref: `${id}-file@toolchain%2Fmetadata.json`, sha256: hash(bytes), status: 'passed' };
  } catch (error) { blockers.push(`No matching successful image fixture: ${(error as Error).message}`); }
}

async function selectEndpoint(blockers: string[]): Promise<void> {
  const endpoint = receipt.dockerEndpoint;
  if (!dockerContext && dockerHost) endpoint.endpoint = dockerHost;
  else {
    const args = ['context', 'inspect', '--format', '{"name":{{json .Name}},"endpoint":{{json .Endpoints.docker.Host}}}'];
    if (dockerContext) args.push(dockerContext);
    endpoint.check = await docker(args, 'docker-context', limits.controlTimeoutMs);
    const check = endpoint.check;
    try {
      if (failed(check)) throw new Error('Context inspection failed.');
      const found = JSON.parse(await readFile(join(attempt, check.stdout), 'utf8'));
      endpoint.context = found.name;
      endpoint.endpoint = found.endpoint;
    } catch { blockers.push('Docker context is unavailable; see the context-check receipt and raw output.'); }
  }
  if (!blockers.length) {
    if (typeof endpoint.endpoint !== 'string' || !/^unix:\/\/\//.test(endpoint.endpoint) || /[\r\n\0]/.test(endpoint.endpoint))
      blockers.push('This recipe supports only Unix Docker endpoints with a local shared filesystem; TCP, SSH, and other endpoints are unsupported.');
    else selectedEndpoint = endpoint.endpoint;
  }
}

async function checkLocalImage(inputRoot: string, blockers: string[]): Promise<string> {
  const profile = await realpath(join(attempt, 'knip-profile.json'));
  if (!(await stat(profile)).isFile())
    throw new Error('Expected a regular knip-profile.json file.');
  await readJson('knip-profile.json');
  if ([inputRoot, profile].some(value => /[,\r\n]/.test(value)))
    throw new Error('Docker mount paths must not contain commas or line breaks.');
  receipt.imageCheck = await docker(
    ['image', 'inspect', '--format', '{{.Id}}', imageId as string], 'docker-image', limits.controlTimeoutMs,
  );
  const check = receipt.imageCheck;
  const inspectedId = (await readFile(join(attempt, check.stdout), 'utf8')).trim();
  if (failed(check) || inspectedId !== imageId)
    blockers.push('Docker or the approved local image is unavailable; see the image-check receipt and raw output.');
  return profile;
}

async function verifyInputView(inputRoot: string, blockers: string[]): Promise<void> {
  const check = await command('python3', [inventoryView, 'verify', work,
    inventoryPath, inputDigests.inventorySha256, plan.snapshotRef, id], 'knip-input-check', limits.inputCheckTimeoutMs);
  receipt.inputView = { verification: check, status: 'failed' };
  try {
    if (failed(check)) throw new Error('Input verification command failed.');
    const bytes = await readFile(join(attempt, check.stdout));
    const view = JSON.parse(bytes.toString());
    if (view.status !== 'verified' || view.snapshotRef !== plan.snapshotRef || view.attemptId !== id ||
        view.viewRoot !== inputRoot || view.inventorySha256 !== inputDigests.inventorySha256 || view.unindexedInputsAvailable !== false)
      throw new Error('Input verification receipt does not match this run.');
    receipt.inputView = { ...receipt.inputView, status: 'verified', root: inputRoot,
      ref: `${id}-file@${encodeURIComponent(check.stdout)}`, sha256: hash(bytes) };
  } catch (error) { blockers.push(`Inventory-only input not verified: ${(error as Error).message}`); }
}

// Runs one Knip mode in a new container and returns its receipt.
async function runMode(mode: string, inputRoot: string, profile: string): Promise<{ run: Record<string, unknown>; cleanupConfirmed: boolean }> {
  const containerName = `choom-${id.slice(0, 40).toLowerCase()}-${mode}-${randomBytes(6).toString('hex')}`;
  const args = [
    'run', '--rm', '--pull=never', '--name', containerName,
    '--network', 'none', '--read-only', '--cap-drop', 'ALL',
    '--env', 'KNIP_DISABLE_RAW_TRANSFER=1',
    '--security-opt', 'no-new-privileges', '--user', limits.user,
    '--pids-limit', String(limits.pids), '--memory', limits.memory, '--memory-swap', limits.memory,
    '--tmpfs', `/tmp:rw,noexec,nosuid,nodev,size=${limits.tmpfs},mode=1777`,
    '--mount', `type=bind,source=${inputRoot},target=/repo,readonly`,
    '--mount', `type=bind,source=${profile},target=/control/knip.json,readonly`,
    '--workdir', '/repo', '--entrypoint', 'node', imageId as string,
    '/opt/choom-tools/node_modules/knip/bin/knip.js',
    '--config', '/control/knip.json', '--reporter', 'json', '--no-progress', '--no-gitignore',
  ];
  if (mode === 'production') args.push('--production');
  const result = await docker(args, `knip-${mode}`, limits.runTimeoutMs);
  const run: Record<string, unknown> = { mode, containerName, imageId, ...result };
  run.cleanup = { status: 'automatic-requested', reason: 'Docker run used --rm.' };
  let cleanupConfirmed = true;
  if (result.timedOut || result.signal || result.errors.length) {
    const cleanup = await docker(['rm', '--force', containerName], `knip-${mode}-cleanup`, limits.controlTimeoutMs);
    cleanupConfirmed = cleanup.exitCode === 0 && !cleanup.signal && !cleanup.timedOut && !cleanup.errors.length;
    run.cleanup = { status: cleanupConfirmed ? 'confirmed' : 'unconfirmed', ...cleanup };
  }
  const report: { valid: boolean; issueRecordCount: number | null; error: string | null } = { valid: false, issueRecordCount: null, error: null };
  run.report = report;
  try {
    if ((await stat(join(attempt, result.stdout))).size > limits.maxReportBytes)
      throw new Error(`Report exceeds the ${limits.maxReportBytes}-byte parse limit; raw output was preserved.`);
    const parsed = JSON.parse(await readFile(join(attempt, result.stdout), 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.issues))
      throw new Error('Expected a JSON object with an issues array.');
    report.valid = true;
    report.issueRecordCount = parsed.issues.length;
  } catch (error) { report.error = (error as Error).message; }
  run.status = [0, 1].includes(result.exitCode as number) && !result.signal && !result.timedOut &&
    !result.errors.length && report.valid ? 'completed' : 'failed';
  return { run, cleanupConfirmed };
}

const blockers: string[] = [];
if (preflight.status === 'unsupported')
  blockers.push(...(preflight.reasons.length ? preflight.reasons : ['Preflight marked this profile unsupported.']));
if (!imageId || !/^sha256:[a-f0-9]{64}$/.test(imageId))
  blockers.push('No approved available tool image: CHOOM_KNIP_IMAGE must be an inspected sha256 image ID.');
if (!blockers.length) await checkImageFixture(blockers);
if (!blockers.length) await selectEndpoint(blockers);
let inputRoot = '';
let profile = '';
if (!blockers.length) {
  inputRoot = join(work, `knip-input-${inputDigests.inventorySha256}`);
  profile = await checkLocalImage(inputRoot, blockers);
}
if (!blockers.length) await verifyInputView(inputRoot, blockers);

let cleanupUnconfirmed = false;
for (const mode of ['normal', 'production']) {
  const reasons = [...blockers];
  if (mode === 'production' && !plan.runProduction)
    reasons.push(`Production analysis was not selected: ${plan.productionReason}`);
  if (cleanupUnconfirmed)
    reasons.push('The previous container cleanup was not confirmed. Resolve it before another run.');
  if (reasons.length) {
    receipt.runs.push(skipped(mode, reasons));
    continue;
  }
  const { run, cleanupConfirmed } = await runMode(mode, inputRoot, profile);
  cleanupUnconfirmed = !cleanupConfirmed;
  receipt.runs.push(run);
}
const receiptText = `${JSON.stringify(receipt, null, 2)}\n`;
await writeFile(receiptPath, receiptText, { flag: 'wx' });
// The review copies each required gap exactly, and finish gives the gaps again from the saved receipts.
const required: RequiredGaps = { formatVersion: 1,
  gaps: new ToolGaps(`${id}-`).fromKnipRuns(JSON.parse(receiptText), `${id}-knip-runs`, preflight) };
await writeFile(join(attempt, 'required-gaps.json'), `${JSON.stringify(required, null, 2)}\n`, { flag: 'wx' });
console.log((receipt.runs as { mode: string; status: string }[]).map(run => `${run.mode}: ${run.status}`).join('\n'));
