import { readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { join, resolve, sep } from 'node:path';

// Maintenance for runs whose Stage 2 attempts each made a knip-input-<attempt>
// folder. It adopts the source attempt's folder as the shared input and removes
// the retired attempts' folders through the inventory view helper. It refuses to
// start when a registered artifact changed or is inside a folder that it moves.
const [sourceAttempt, ...retireAttempts] = process.argv.slice(2);
if (sourceAttempt === undefined) throw new Error('Use stage-2-consolidate SOURCE_ATTEMPT [RETIRE_ATTEMPT...].');
const work = realpathSync(process.env.CHOOM_WORK as string);
const tools = realpathSync(process.env.CHOOM_TOOLS as string);
const { parse } = createRequire(join(tools, 'package.json'))('yaml');
const run = parse(readFileSync(join(work, 'run.yaml'), 'utf8'));
const record = run.artifacts?.[run.snapshot?.inventoryRef];
if (run.snapshot?.root !== 'snapshot' || typeof run.snapshot.id !== 'string' ||
    typeof record?.path !== 'string' || !/^[a-f0-9]{64}$/i.test(record.sha256 ?? ''))
  throw new Error('Expected a saved snapshot and its registered inventory.');
const inventory = realpathSync(resolve(work, record.path));
if (!inventory.startsWith(work + sep)) throw new Error('Inventory is outside the working folder.');
const affected = [sourceAttempt, ...retireAttempts].flatMap(id =>
  [join(work, `knip-input-${id}`), join(work, `.knip-input-retired-${id}`)]);
affected.push(join(work, 'evidence', `knip-input-migration-${sourceAttempt}.json`));
for (const [id, artifact] of Object.entries<{ path: string; sha256?: string }>(run.artifacts)) {
  const path = realpathSync(resolve(work, artifact.path));
  if (!path.startsWith(work + sep) || affected.some(root => path === root || path.startsWith(root + sep)))
    throw new Error(`Registered evidence would be moved or changed: ${id}`);
  if (createHash('sha256').update(readFileSync(path)).digest('hex') !== artifact.sha256?.toLowerCase())
    throw new Error(`Registered evidence changed: ${id}`);
}
const result = spawnSync(process.execPath, [join(tools, 'packages/producer/src/cli.ts'), 'inventory-view',
  'consolidate', work, inventory, record.sha256, run.snapshot.id,
  sourceAttempt, ...retireAttempts.flatMap(id => ['--retire', id])], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
