import { randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { baselineSchema } from '@choom/baseline-model';
import * as yaml from 'yaml';
import type { RunProject } from './generated/contracts.ts';
import { assert, hash, text } from './record-checks.ts';
import { readBaselineYaml } from './stage-6-records.ts';

export const referencePath = 'evidence/reference-baseline.yaml';
export const referenceRef = 'reference-baseline-001';
const maxBytes = 16 * 1024 * 1024;

function selectedBytes(path: string): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const file = fstatSync(fd);
    assert(file.isFile(), 'The reference baseline must be a regular file.');
    assert(file.size <= maxBytes, 'The reference baseline exceeds the 16 MiB file limit.');
    const buffer = Buffer.alloc(file.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const count = readSync(fd, buffer, offset, buffer.length - offset, offset);
      if (count === 0) break;
      offset += count;
    }
    assert(offset === file.size, 'The selected reference baseline changed during reading.');
    return buffer.subarray(0, offset);
  } finally {
    closeSync(fd);
  }
}

export function selectProjectKey(explicit: string | undefined, reference: string | null): string {
  assert(explicit === undefined || text(explicit), 'Set CHOOM_PROJECT_KEY to a nonempty project key.');
  assert(explicit === undefined || Buffer.byteLength(explicit, 'utf8') <= 4 * 1024,
    'CHOOM_PROJECT_KEY can contain at most 4096 UTF-8 bytes.');
  assert(explicit === undefined || reference === null || explicit === reference,
    'CHOOM_PROJECT_KEY conflicts with the selected reference baseline.');
  return reference ?? explicit ?? randomUUID();
}

export function prepareRunProject(key: string | undefined, path: string | undefined): { identity: RunProject; bytes?: Buffer } {
  if (path === undefined) return { identity: { projectKey: selectProjectKey(key, null), referenceBaseline: null } };
  const bytes = selectedBytes(path);
  const sha256 = hash(bytes);
  const checked = baselineSchema.safeParse(readBaselineYaml(bytes, yaml));
  assert(checked.success, 'Invalid reference baseline: ' + (checked.error?.issues[0]?.message ?? 'invalid structure'));
  assert(checked.data.formatVersion === 6, 'The reference baseline must use format version 6.');
  const projectKey = selectProjectKey(key, checked.data.boundaryReview.identity.projectKey);
  return { identity: { projectKey, referenceBaseline: { artifactRef: referenceRef, sha256 } }, bytes };
}
