import type { BaselineV6, IsolationFinding } from "./generated/contracts.ts";
import type { ReadonlyData } from "./readonly-data.ts";

function countRecords(file: ReadonlyData<BaselineV6>): number {
  const review = file.boundaryReview;
  return 1 + file.components.length + file.interfaces.length + file.resources.length + file.rules.length +
    review.componentScopes.length + review.units.length + review.operations.length + review.accesses.length +
    review.rules.length + review.checks.length + review.callerSearches.length + review.sourceNotes.length + review.matches.length;
}

/** Overlapping rules can describe many combinations of the same sites. Bound
 * both the number of findings and each list of references by the input size. */
export class ComparisonResult {
  readonly findings: IsolationFinding[] = [];
  private readonly limit: number;
  private readonly used = { accessIds: 0, resultIds: 0, coverageIds: 0 };

  constructor(before: ReadonlyData<BaselineV6>, after: ReadonlyData<BaselineV6>) {
    this.limit = countRecords(before) + countRecords(after);
  }

  add(findings: Iterable<IsolationFinding>): boolean {
    for (const finding of findings) {
      let fits = this.findings.length < this.limit - 1;
      for (const field of ["accessIds", "resultIds", "coverageIds"] as const) {
        this.used[field] += (finding.before?.[field].length ?? 0) + (finding.after?.[field].length ?? 0);
        if (this.used[field] > this.limit) fits = false;
      }
      if (!fits) {
        this.findings.push({ change: "Comparison limited", reason: "The result limit was reached while grouping overlapping checks and sites.",
          before: null, after: null });
        return false;
      }
      this.findings.push(finding);
    }
    return true;
  }
}
