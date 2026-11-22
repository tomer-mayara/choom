import type { RequiredGaps } from './generated/contracts.ts';
import { ToolGaps } from './tool-gaps.ts';

// The required gaps of the Stage 3 tool records (DB5). collect saves
// required-gaps.json with the gap of its symbol mentions when they are partial,
// unavailable or skipped. Each exports request saves exports-NNN.required-gaps.json
// with one gap for each gap of its exports record, exports-NNN.json. Each file has the
// form of the RequiredGaps contract (cookbook/interfaces/producer-run-records.tsp),
// and the receipt of the action names it. The review copies each gap exactly.
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

  // The artifact ID of a file of the attempt.
  #ref(name: string): string {
    return this.#id + '-file@' + encodeURIComponent(name);
  }
}
