import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, realpathSync, writeSync } from 'node:fs';
import { join } from 'node:path';

// The record of the producer code that started a run. Stage 1 start saves it,
// and every later stage action compares the code in the tool checkout with it.
// So a run uses one version of the producer code from start to end, and stage
// actions can run the code in the checkout instead of copies in the run folder.
export interface ProducerReceipt {
  formatVersion: 1;
  package: string;
  version: string;
  codeDigest: string;
  commit: string;
}

export const producerRecordPath = 'evidence/producer.json';
const producerPackage = '@choom/producer';
const codeFolders = ['packages/producer/src', 'packages/baseline-model/src'];
const commitUnavailable = 'not-available';
const receiptKeys = ['formatVersion', 'package', 'version', 'codeDigest', 'commit'];

const sha256 = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
// Reads value?.[key] from an unchecked value.
const field = (value: unknown, key: string): unknown => (value as Record<string, unknown> | null | undefined)?.[key];

// Adds the path of every regular file below a code folder, relative to the tool checkout.
function listCodeFiles(toolsRoot: string, folder: string, files: string[]): void {
  for (const name of readdirSync(join(toolsRoot, folder))) {
    const path = folder + '/' + name;
    // A line break in a name would make two files look like one line of the digest input.
    if (/[\u0000-\u001f\u007f]/.test(name))
      throw new Error('The producer code contains a file name with a control character: ' + JSON.stringify(path));
    const entry = lstatSync(join(toolsRoot, path));
    if (entry.isDirectory()) listCodeFiles(toolsRoot, path, files);
    else if (entry.isFile()) files.push(path);
    else throw new Error('The producer code contains an entry that is not a regular file or folder: ' + path);
  }
}

// SHA-256 over one "<file SHA-256>  <path>\n" line for each regular file in
// packages/producer/src and packages/baseline-model/src, sorted by the UTF-8
// bytes of the paths. Paths are relative to the tool checkout and use "/".
export function producerCodeDigest(toolsRoot: string): string {
  const files: string[] = [];
  for (const folder of codeFolders) {
    if (!lstatSync(join(toolsRoot, folder), { throwIfNoEntry: false })?.isDirectory())
      throw new Error('The producer code folder is missing or is not a real folder: ' + folder);
    listCodeFiles(toolsRoot, folder, files);
  }
  files.sort((first, second) => Buffer.compare(Buffer.from(first), Buffer.from(second)));
  return sha256(files.map(path => sha256(readFileSync(join(toolsRoot, path))) + '  ' + path + '\n').join(''));
}

function producerVersion(toolsRoot: string): string {
  const manifest: unknown = JSON.parse(readFileSync(join(toolsRoot, 'packages/producer/package.json'), 'utf8'));
  const version = field(manifest, 'version');
  if (field(manifest, 'name') !== producerPackage || !text(version))
    throw new Error('Expected the @choom/producer name and version in packages/producer/package.json.');
  return version;
}

// The commit of the Git checkout whose top folder is the tool checkout, or
// not-available. A copy of the code inside another checkout has no own commit.
function checkoutCommit(toolsRoot: string): string {
  const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  const result = spawnSync('git', ['rev-parse', '--show-toplevel', 'HEAD'], { cwd: toolsRoot, env: environment,
    encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'ignore'] });
  const [top = '', commit = ''] = result.status === 0 ? result.stdout.split('\n') : [];
  const sameCheckout = top !== '' && realpathSync(top) === realpathSync(toolsRoot);
  return sameCheckout && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit) ? commit : commitUnavailable;
}

export function producerReceipt(toolsRoot: string): ProducerReceipt {
  return { formatVersion: 1, package: producerPackage, version: producerVersion(toolsRoot),
    codeDigest: producerCodeDigest(toolsRoot), commit: checkoutCommit(toolsRoot) };
}

function validReceipt(value: unknown): value is ProducerReceipt {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === receiptKeys.length && receiptKeys.every(key => Object.hasOwn(value, key)) &&
    field(value, 'formatVersion') === 1 && field(value, 'package') === producerPackage && text(field(value, 'version')) &&
    /^[0-9a-f]{64}$/.test(String(field(value, 'codeDigest'))) && text(field(value, 'commit'));
}

function readReceipt(work: string): ProducerReceipt {
  const path = join(work, producerRecordPath);
  const entry = lstatSync(path, { throwIfNoEntry: false });
  if (entry === undefined)
    throw new Error(`This run has no record of the producer code that started it (${producerRecordPath}). Start a new run.`);
  let value: unknown;
  try {
    value = entry.isFile() ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
  } catch {
    value = undefined;
  }
  if (!validReceipt(value))
    throw new Error(`The record of the producer code (${producerRecordPath}) is not valid. Start a new run.`);
  return value;
}

// Refuses a run without a valid record, or a tool checkout whose code differs
// from the code that the run recorded at Stage 1 start.
export function checkProducerCode(work: string, toolsRoot: string): void {
  const recorded = readReceipt(work);
  if (producerCodeDigest(toolsRoot) !== recorded.codeDigest)
    throw new Error('The producer code changed after this run started. ' +
      `This run recorded commit ${recorded.commit} and code digest ${recorded.codeDigest}. ` +
      'Continue the run with that producer version, or start a new run.');
}

// The form of checkProducerCode for a stage helper, before the action reads or
// writes the run: a refusal prints its reason and ends the process with exit
// code 1. The direct write keeps the reason when the process ends at once.
export function refuseChangedProducerCode(work: string, toolsRoot: string): void {
  try {
    checkProducerCode(work, toolsRoot);
  } catch (error) {
    writeSync(2, (error as Error).message + '\n');
    process.exit(1);
  }
}
