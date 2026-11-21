import { assert, exact, type Fields, object, oneOf, strings, text } from './record-checks.ts';
import { isUseRole } from './stage-1-role-use.ts';

// Link the priority to a file candidate and the precise, previously checked range
// the reviewer saw. Stage 4 inspects the operation and handler at that site.
export class InspectionClues {
  private readonly sources: ReadonlyMap<unknown, Fields>;
  private readonly candidatePaths: Map<unknown, unknown>;

  private readonly matches: Map<string, Fields>;

  constructor(sources: ReadonlyMap<unknown, Fields>, candidates: Fields[], loading?: { ref: string; matches: Fields[] }) {
    this.sources = sources;
    this.candidatePaths = new Map(candidates.map(item => [item.id, item.path]));
    this.matches = new Map(loading?.matches.map((match, index) => [loading.ref + '#/matches/' + index, match]));
  }

  validate(priority: Fields): void {
    const clue = priority.clue;
    if (clue === undefined) return;
    assert(object(clue), 'Invalid inspection clue.');
    const source = this.sources.get(clue.sourceRef);
    assert(source && strings(priority.evidenceRefs) && text(clue.sourceRef) &&
      priority.evidenceRefs.includes(clue.sourceRef), 'An inspection clue must cite its exact reviewed range.');
    assert(strings(priority.subjectRefs) &&
      priority.subjectRefs.some(ref => source.path === ref || source.path === this.candidatePaths.get(ref)),
    'An inspection clue must name the source file or its candidate as a subject.');
    if (clue.kind === 'unresolved-loader') {
      this.checkLoader(clue, source, priority.evidenceRefs);
      return;
    }
    assert(exact(clue, ['kind', 'operation', 'context', 'sourceRef']) && clue.kind === 'registration' &&
      text(clue.operation) && isUseRole(clue.context), 'Invalid registration clue.');
  }

  private checkLoader(clue: Fields, source: Fields, evidence: string[]): void {
    assert(exact(clue, ['kind', 'context', 'sourceRef', 'matchRef', 'expression', 'missingBinding']) &&
      clue.context === 'unknown' && text(clue.missingBinding) && text(clue.matchRef) && text(clue.expression),
    'An unresolved loader needs its expression, unknown context and missing binding.');
    const match = this.matches.get(clue.matchRef);
    const [first, last] = source.lines as [number, number];
    assert(match && evidence.includes(clue.matchRef) && match.path === source.path && match.sha256 === source.sha256 &&
      oneOf(['import-literal', 'import-computed', 'require', 'require.resolve', 'import.meta.glob'], match.kind) &&
      match.expression === clue.expression && Array.isArray(match.lines) && match.lines.length === 2 &&
      first <= match.lines[0] && last >= match.lines[1], 'The loading match must be cited inside its reviewed range.');
  }
}
