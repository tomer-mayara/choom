import { isDeepStrictEqual as same } from 'node:util';
import { assert, evidenceBase, type Fields } from './record-checks.ts';
import type { SourceRecords } from './record-sources.ts';

// What the reviewed source checks read from the selected records of a run.
export interface ReviewedSourceInputs {
  // The files of the snapshot inventory, by path.
  readonly indexed: ReadonlyMap<unknown, Fields>;
  // Gives the value that an evidence reference names.
  resolve(ref: unknown): unknown;
  // The saved source records of the run: the reviewed ranges and each saved excerpt.
  readonly source: Pick<SourceRecords, 'records'>;
  // The reviewed ranges of the selected entry analysis and of the earlier ones that it names.
  readonly reviewedRanges: readonly Fields[];
}

// The source that the reviews of the selected history read. A reviewed range takes
// the ID of the excerpt that the review read. So an excerpt that no review read is not
// a reviewed range, also when it has the same path and lines. The shared record checks
// of Stages 4 to 6 use these checks for a behavior entry, a resource access
// observation and each step of an inspected path.
export class ReviewedSource {
  private readonly indexed: ReadonlyMap<unknown, Fields>;
  private readonly resolve: (ref: unknown) => unknown;
  private readonly records: ReadonlyMap<unknown, Fields>;
  private readonly reviewedRanges: readonly Fields[];
  private readonly reviewedById: ReadonlyMap<unknown, Fields>;

  constructor({ indexed, resolve, source, reviewedRanges }: ReviewedSourceInputs) {
    this.indexed = indexed;
    this.resolve = resolve;
    this.records = source.records;
    this.reviewedRanges = reviewedRanges;
    this.reviewedById = new Map(reviewedRanges.map(range => [range.id, range]));
  }

  // A behavior entry or resource access names a source site inside a reviewed range
  // that the item cites. The item cites the reviewed range itself: a reference that
  // resolves to the whole range and whose ID is the ID of a reviewed range of the
  // selected history. `label` names the kind of item in the message.
  checkSite(item: Fields, label: string): void {
    const site = item.source as Fields | undefined;
    const lines = site?.lines as number[];
    const supports = (range: unknown): boolean => {
      const reviewed = range as Fields | undefined;
      const reviewedLines = reviewed?.lines as number[];
      return reviewed?.path === site?.path && Array.isArray(reviewed?.lines) &&
        (reviewedLines[0] as number) <= (lines[0] as number) && (reviewedLines[1] as number) >= (lines[1] as number);
    };
    assert(this.indexed.has(site?.path) && Array.isArray(site?.lines) && lines.length === 2 &&
      lines.every(Number.isSafeInteger) && (lines[0] as number) > 0 && (lines[1] as number) >= (lines[0] as number) &&
      this.reviewedRanges.some(supports), 'Site is outside the selected source review history: ' + item.id);
    const cites = (ref: unknown): boolean => supports(this.citedRange(ref));
    assert((item.evidenceRefs as unknown[]).some(cites), label + ' ' + item.id +
      ' does not cite a reviewed range that contains its site. An excerpt that no review read is not a reviewed range.');
  }

  // Each step of an inspected path cites at least one reviewed range of the selected
  // history itself, as a site does. Each other saved source range that the step cites is
  // a reviewed range too. A step can also cite other records, such as a graph or a
  // references record, for its scope.
  checkStep(path: Fields, step: Fields, number: number): void {
    const name = 'Inspected path ' + String(path.id) + ' step ' + number;
    const refs = step.evidenceRefs as string[];
    assert(refs.some(ref => this.citedRange(ref) !== undefined),
      name + ' does not cite a reviewed range. An excerpt that no review read is not a reviewed range.');
    for (const ref of refs) assert(!this.records.has(evidenceBase(ref)) || this.reviewedById.has(evidenceBase(ref)),
      name + ' cites ' + ref + ', a saved source range that is not a reviewed range of the selected history.');
  }

  // The reviewed range that a reference cites itself: by the ID of the range, alone or
  // with an empty JSON Pointer. A pointer to a field of the range, such as id#/lines,
  // does not cite the range.
  private citedRange(ref: unknown): Fields | undefined {
    const value = this.resolve(ref);
    const range = this.reviewedById.get(evidenceBase(ref as string));
    return range !== undefined && same(value, range) ? range : undefined;
  }
}
