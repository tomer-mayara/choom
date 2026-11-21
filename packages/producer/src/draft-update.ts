import { renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assert } from './record-checks.ts';

// One update of the working drafts of a run, as Stages 2 to 5 publish it. Each new
// draft is saved as a temporary file in the run folder first. Then the temporary
// files replace the drafts one by one, and run.yaml, the publication marker, is last.
// Before each replacement, the update checks the temporary file, the drafts that it
// did not replace yet and the drafts that it replaced. When a step fails before
// run.yaml is replaced, rollBack gives each replaced draft its bytes from before the
// update and removes the temporary files. A file that another writer changed stays,
// and the error names it.
export interface DraftUpdateInputs {
  // The run folder that holds the drafts.
  work: string;
  // The start of the names of the temporary files in the run folder.
  prefix: string;
  // The drafts before the update, by name, as the attempt checkpointed them.
  before: ReadonlyMap<string, Buffer>;
  // Reads a file of the run folder by its name.
  read(name: string): Buffer;
  // What the operator does after a failure. The error gives it after the reason.
  advice: string;
}
export interface DraftUpdate {
  // Saves the new bytes of a draft as a temporary file. Stage run.yaml last.
  stage(name: string, bytes: Buffer): void;
  // Replaces the drafts with the staged files, in the order of stage().
  place(): void;
  // Restores the replaced drafts and removes the temporary files, and returns the error to report.
  rollBack(error: Error): Error;
}

export function draftUpdate({ work, prefix, before, read, advice }: DraftUpdateInputs): DraftUpdate {
  const staged = new Map<string, Buffer>();
  const temporary = new Map<string, Buffer>();
  const placed = new Map<string, Buffer>();
  return {
    stage(name, bytes) {
      assert(before.has(name) && !staged.has(name) && !staged.has('run.yaml'), 'Stage each draft once, and run.yaml last: ' + name);
      writeFileSync(join(work, prefix + name), bytes, { flag: 'wx' });
      temporary.set(prefix + name, bytes);
      staged.set(name, bytes);
    },
    place() {
      assert(staged.has('run.yaml'), 'Stage run.yaml last.');
      for (const [name, bytes] of staged) {
        assert(read(prefix + name).equals(bytes), 'Staged output changed: ' + name);
        for (const [draft, old] of before) if (!placed.has(draft)) assert(read(draft).equals(old), 'Working draft changed: ' + draft);
        for (const [draft, done] of placed) assert(read(draft).equals(done), 'Published output changed: ' + draft);
        renameSync(join(work, prefix + name), join(work, name));
        temporary.delete(prefix + name);
        placed.set(name, bytes);
      }
    },
    rollBack(error) {
      const leftovers: string[] = [];
      for (const [name, bytes] of [...placed].reverse()) {
        try {
          assert(read(name).equals(bytes), 'Changed output');
          const rollback = prefix + 'rollback-' + name;
          writeFileSync(join(work, rollback), before.get(name) as Buffer, { flag: 'wx' });
          renameSync(join(work, rollback), join(work, name));
        } catch { leftovers.push(name); }
      }
      for (const [name, bytes] of temporary) {
        try {
          if (read(name).equals(bytes)) unlinkSync(join(work, name));
          else leftovers.push(name);
        } catch { leftovers.push(name); }
      }
      return new Error(error.message + ' ' + advice + (leftovers.length ? ' Inspect retained paths: ' + leftovers.join(', ') : ''));
    },
  };
}
