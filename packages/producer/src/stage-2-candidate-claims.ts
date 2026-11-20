import { assert, evidenceBase, exact, type Fields, object, oneOf, text } from './record-checks.ts';

// A Knip report names files with issues. It gives no evidence that a module ran.
export class CandidateClaims {
  private readonly reported = new Map<string, Set<string>>();
  private readonly runsRef: string;
  private readonly runs: Fields[];
  private readonly readReport: (name: string) => unknown;

  constructor(runsRef: string, runs: Fields[], readReport: (name: string) => unknown) {
    this.runsRef = runsRef;
    this.runs = runs;
    this.readReport = readReport;
  }

  validate(candidate: Fields, required = false): void {
    const claims = candidate.knipClaims;
    assert((!required && claims === undefined) || Array.isArray(claims),
      'Give each reviewed candidate its knipClaims, including an empty list for a declaration.');
    const seen = new Set<string>();
    for (const claim of claims ?? []) {
      assert(exact(claim, ['mode', 'receiptRef', 'outcome']) && oneOf(['unknown', 'reported'], claim.outcome),
        'Give each Knip claim its mode, exact receipt and outcome.');
      const index = this.runs.findIndex(run => run.mode === claim.mode);
      const ref = this.runsRef + '#/runs/' + index;
      const run = this.runs[index];
      assert(run && claim.receiptRef === ref && !seen.has(ref), 'A candidate must cite the exact mode receipt once.');
      seen.add(ref);
      if (claim.outcome === 'reported') {
        assert(run.status === 'completed' && text(run.stdout), 'A reported candidate requires a completed Knip scan.');
        assert(text(candidate.path) && this.files(run.stdout).has(candidate.path),
          'The selected Knip report does not name the candidate file.');
      }
    }
    for (const ref of candidate.evidenceRefs as string[]) {
      if (evidenceBase(ref) === this.runsRef) assert(seen.has(ref), 'A candidate tool conclusion must cite its exact mode receipt.');
    }
  }

  private files(stdout: string): Set<string> {
    const saved = this.reported.get(stdout);
    if (saved) return saved;
    const report = this.readReport(stdout);
    assert(object(report) && Array.isArray(report.issues), 'Invalid Knip candidate report.');
    const files = new Set<string>();
    for (const issue of report.issues) if (object(issue) && text(issue.file)) files.add(issue.file);
    if (Array.isArray(report.files)) for (const path of report.files) if (text(path)) files.add(path);
    this.reported.set(stdout, files);
    return files;
  }
}
