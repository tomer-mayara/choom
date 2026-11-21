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
  private readonly reviewedIds: ReadonlySet<unknown>;

  constructor({ indexed, resolve, source, reviewedRanges }: ReviewedSourceInputs) {
    this.indexed = indexed;
    this.resolve = resolve;
    this.records = source.records;
    this.reviewedRanges = reviewedRanges;
    this.reviewedIds = new Set(reviewedRanges.map(range => range.id));
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
    const cites = (ref: unknown): boolean => supports(this.resolve(ref)) && this.reviewedIds.has(evidenceBase(ref as string));
    assert((item.evidenceRefs as unknown[]).some(cites), label + ' ' + item.id +
      ' does not cite a reviewed range that contains its site. An excerpt that no review read is not a reviewed range.');
  }

  // Each step of an inspected path cites at least one saved source range, and each
  // source range that it cites is inside a reviewed range of the selected history: the
  // same snapshot, path and digest, with reviewed lines that include its lines. A step
  // can also cite other records, such as a graph record.
  checkStep(path: Fields, step: Fields, number: number): void {
    const name = String(path.id) + ' step ' + number;
    const cited = (step.evidenceRefs as string[]).filter(ref => this.records.has(evidenceBase(ref)));
    assert(cited.length > 0, 'Missing cited reviewed source for inspected path step: ' + name);
    for (const ref of cited) assert(this.inside(this.records.get(evidenceBase(ref)) as Fields),
      'Inspected path step is outside the selected source review history: ' + name + ': ' + ref);
  }

  private inside(record: Fields): boolean {
    return this.reviewedRanges.some(range => {
      const [first, last] = range.lines as number[];
      const [from, to] = record.lines as number[];
      return range.snapshotRef === record.snapshotRef && range.path === record.path && range.sha256 === record.sha256 &&
        (first as number) <= (from as number) && (last as number) >= (to as number);
    });
  }
}
