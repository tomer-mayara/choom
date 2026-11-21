import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { assert } from './record-checks.ts';

// The files that the producer actions saved in an attempt folder: each phase receipt,
// the outputs and logs that it names, and the files that the stage names itself, such
// as the files of the review packet and the command log. A publisher registers every
// file of the attempt folder as evidence, so it refuses any other file, and names it.
// The record format says not to write into an attempt.
export class SavedAttemptFiles {
  private readonly names = new Set<string>();

  // The files of an attempt folder and of its folders, by their paths in the attempt.
  static namesIn(attempt: string, folder = ''): string[] {
    return readdirSync(join(attempt, folder)).flatMap(leaf => {
      const name = folder ? folder + '/' + leaf : leaf;
      return lstatSync(join(attempt, name)).isDirectory() ? SavedAttemptFiles.namesIn(attempt, name) : [name];
    });
  }

  // A phase receipt and the outputs and logs that it names.
  addReceipt(receipt: string, named: Iterable<string>): this {
    return this.add([receipt, ...named]);
  }

  // Files that the stage saves without a receipt that names them.
  add(names: Iterable<string>): this {
    for (const name of names) this.names.add(name);
    return this;
  }

  // Refuses the attempt files that no producer action saved, and names each one.
  refuseOthers(attemptFiles: Iterable<string>): void {
    const stray = [...attemptFiles].filter(name => !this.names.has(name)).sort();
    assert(stray.length === 0, 'Unexpected attempt file that no producer action saved: ' + stray.join(', ') +
      '. Do not write into the attempt; use a fresh attempt.');
  }
}
