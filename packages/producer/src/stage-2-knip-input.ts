import { readFileSync, openSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';

// The Stage 2 prepare action runs the copy of this module that start saved in
// the attempt. For an eligible profile, the saved inventory-view.py helper
// prepares or reuses the shared inventory-only Knip input and checks it.
const work = resolve(process.env.CHOOM_WORK as string);
const attempt = resolve(process.env.CHOOM_STAGE2 as string);
const preflight = JSON.parse(readFileSync(join(attempt, 'preflight.json')).toString());
if (preflight.status === 'eligible') {
  const inventory = resolve(work, preflight.inventory.path);
  if (!inventory.startsWith(work + '/') || createHash('sha256').update(readFileSync(inventory)).digest('hex') !== preflight.inventory.sha256)
    throw new Error('The registered inventory changed.');
  const out = openSync(join(attempt, 'knip-input.json'), 'wx');
  const err = openSync(join(attempt, 'knip-input.stderr.txt'), 'wx');
  let result;
  try {
    result = spawnSync('python3', [join(attempt, 'inventory-view.py'), 'prepare', work,
      inventory, preflight.inventory.sha256, preflight.snapshotRef, process.env.CHOOM_STAGE2_ID as string],
    { stdio: ['ignore', out, err] });
  } finally { closeSync(out); closeSync(err); }
  if (result.error || result.status !== 0 || result.signal)
    throw new Error('Input preparation failed; see knip-input.stderr.txt. Preserve this attempt.');
  console.log('Inventory-only input prepared.');
} else console.log('Input preparation skipped: unsupported profile.');
