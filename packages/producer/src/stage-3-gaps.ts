import { isDeepStrictEqual as same } from 'node:util';
import type { RequiredGaps } from './generated/contracts.ts';
import { assert } from './record-checks.ts';
import { type ReviewIssues, ToolGaps } from './tool-gaps.ts';

// The required gaps of the Stage 3 tool records (DB5). collect saves
// required-gaps.json with the gap of its symbol mentions when they are partial,
// unavailable or skipped. Each exports request saves exports-NNN.required-gaps.json
// with one gap for each gap of its exports record, exports-NNN.json. Each file has the
// form of the RequiredGaps contract (cookbook/interfaces/producer-run-records.tsp),
// and the receipt of the action names it. The review copies each gap exactly.
// A tool record of the attempt: its name in the gap IDs, its file, the file of its
// required gaps, and the required gaps that it gives.
interface SavedToolRecord { name: string; record: string; file: string; required: RequiredGaps }

export class StageThreeGaps {
  // The file of the required gaps of collect.
  static readonly collectFile = 'required-gaps.json';
  readonly #id: string;
  readonly #gaps: ToolGaps;

  constructor(attemptId: string) {
    this.#id = attemptId;
    this.#gaps = new ToolGaps(attemptId + '-');
  }

  // The file of the required gaps of the exports request `phase`, such as exports-001.required-gaps.json.
  static exportsFile(phase: string): string {
    return phase + '.required-gaps.json';
  }

  // The required gaps of the symbol mentions that collect saved.
  ofSymbolMentions(mentions: unknown): RequiredGaps {
    return { formatVersion: 1, gaps: this.#gaps.fromSymbolMentions(mentions, this.#ref('symbol-mentions.json')) };
  }

  // The required gaps of the exports record that the exports request `phase` saved as <phase>.json.
  ofExports(phase: string, record: unknown): RequiredGaps {
    return { formatVersion: 1, gaps: this.#gaps.fromExports(phase, record, this.#ref(phase + '.json')) };
  }

  // The check of the finalizer. It gives the required gaps again from the saved symbol
  // mentions and from each exports record among the attempt files (`names`), and
  // refuses a saved required-gaps file that differs from them. Then it refuses an
  // analysis that leaves out or changes a required gap, or that gives a question or
  // another gap an ID that starts with <attempt>-symbol-mentions-gap-, or with
  // <attempt>-exports-NNN-gap- for a saved exports-NNN.json. `saved` reads a saved
  // JSON file of the attempt.
  check(names: readonly string[], saved: (name: string) => unknown, issues: ReviewIssues): void {
    const records: SavedToolRecord[] = [{ name: ToolGaps.symbolMentions, record: 'symbol-mentions.json',
      file: StageThreeGaps.collectFile, required: this.ofSymbolMentions(saved('symbol-mentions.json')) }];
    for (const phase of names.flatMap(name => /^(exports-[0-9]+)\.json$/.exec(name)?.[1] ?? []))
      records.push({ name: phase, record: phase + '.json', file: StageThreeGaps.exportsFile(phase),
        required: this.ofExports(phase, saved(phase + '.json')) });
    for (const { name, record, file, required } of records) {
      assert(same(saved(file), required),
        `The required gaps in ${this.#ref(file)} differ from the gaps that ${this.#ref(record)} gives. Use a new attempt.`);
      this.#gaps.checkCopied(name, required.gaps, issues, this.#ref(file));
    }
  }

  // The artifact ID of a file of the attempt.
  #ref(name: string): string {
    return this.#id + '-file@' + encodeURIComponent(name);
  }
}
