import { isDeepStrictEqual as same } from 'node:util';
import type { RequiredGaps } from './generated/contracts.ts';
import { assert } from './record-checks.ts';
import { type DiscoveryGap, ToolGaps } from './tool-gaps.ts';

// The required gaps of the Stage 3 tool records (DB5). collect saves
// required-gaps.json with the gap of its symbol mentions when they are partial,
// unavailable or skipped. Each exports request saves exports-NNN.required-gaps.json
// with one gap for each gap of its exports record, exports-NNN.json. Each file has the
// form of the RequiredGaps contract (cookbook/interfaces/producer-run-records.tsp),
// and the receipt of the action names it. The review copies each gap exactly.

// A tool record of the attempt: its file, the file of its required gaps, and the required gaps that it gives.
interface SavedToolRecord { record: string; file: string; required: RequiredGaps }

// The file of the symbol mentions that collect saves.
const mentionsFile = 'symbol-mentions.json';
// The exports request that saved an exports record, such as exports-001 for exports-001.json.
const exportsPhase = (name: string): string | undefined => /^(exports-[0-9]+)\.json$/.exec(name)?.[1];
// The artifact ID of the entry analysis of a Stage 3 attempt: the attempt ID and -entry-analysis.
const entryAnalysisRef = /^(s3-[a-z0-9-]+)-entry-analysis$/;

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

  // The required gaps of the Stage 3 attempt whose entry analysis has the artifact ID
  // `ref`, such as s3-001-entry-analysis, or undefined when `ref` names no such analysis.
  static ofEntryAnalysis(ref: unknown): StageThreeGaps | undefined {
    const [, attempt] = entryAnalysisRef.exec(String(ref)) ?? [];
    return attempt === undefined ? undefined : new StageThreeGaps(attempt);
  }

  // The required gaps of the symbol mentions that collect saved.
  ofSymbolMentions(mentions: unknown): RequiredGaps {
    return { formatVersion: 1, gaps: this.#gaps.fromSymbolMentions(mentions, this.#ref(mentionsFile)) };
  }

  // The required gaps of the exports record that the exports request `phase` saved as <phase>.json.
  ofExports(phase: string, record: unknown): RequiredGaps {
    return { formatVersion: 1, gaps: this.#gaps.fromExports(phase, record, this.#ref(phase + '.json')) };
  }

  // The required gaps of the tool records of the attempt that a run registered: the
  // symbol mentions, and then each exports record, in the order of `ids`, the artifact IDs
  // of the run. `read` gives a registered record by its artifact ID. The shared record
  // checks of Stages 4 to 6 use them (result-gaps.ts).
  registered(ids: Iterable<string>, read: (id: string) => unknown): DiscoveryGap[] {
    const prefix = this.#ref('');
    // The names of the registered files of the attempt. The name of a tool record needs no URI encoding.
    const names = [...ids].flatMap(id => id.startsWith(prefix) ? [id.slice(prefix.length)] : []);
    const mentions = names.includes(mentionsFile) ? this.ofSymbolMentions(read(this.#ref(mentionsFile))).gaps : [];
    const phases = names.flatMap(name => exportsPhase(name) ?? []);
    return [...mentions, ...phases.flatMap(phase => this.ofExports(phase, read(this.#ref(phase + '.json'))).gaps)];
  }

  // The check of the finalizer. It gives the required gaps again from the saved symbol
  // mentions and from each exports record among the attempt files (`names`), and
  // refuses a saved required-gaps file that differs from them. Then it refuses an
  // analysis whose `gaps` leave out or change a required gap. `saved` reads a saved
  // JSON file of the attempt.
  check(names: readonly string[], saved: (name: string) => unknown, gaps: readonly unknown[]): void {
    const records: SavedToolRecord[] = [{ record: mentionsFile, file: StageThreeGaps.collectFile,
      required: this.ofSymbolMentions(saved(mentionsFile)) }];
    for (const phase of names.flatMap(name => exportsPhase(name) ?? []))
      records.push({ record: phase + '.json', file: StageThreeGaps.exportsFile(phase),
        required: this.ofExports(phase, saved(phase + '.json')) });
    for (const { record, file, required } of records) {
      assert(same(saved(file), required),
        `The required gaps in ${this.#ref(file)} differ from the gaps that ${this.#ref(record)} gives. Use a new attempt.`);
      ToolGaps.checkCopied(required.gaps, gaps, this.#ref(file));
    }
  }

  // The artifact ID of a file of the attempt.
  #ref(name: string): string {
    return this.#id + '-file@' + encodeURIComponent(name);
  }
}
