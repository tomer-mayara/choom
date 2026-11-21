import type {
  BaselineBoundaryReview, BoundaryAccess, BoundaryCheck, BoundaryCoverage, BoundaryRule, BoundaryUnit,
} from "./generated/contracts.ts";

type Path = (string | number)[];
type Problem = (path: Path, reason: string) => void;

export class BoundaryChecks {
  private readonly review: BaselineBoundaryReview;
  private readonly units: Map<string, BoundaryUnit>;
  private readonly accesses: Map<string, BoundaryAccess>;
  private readonly rules: Map<string, BoundaryRule>;
  private readonly problem: Problem;

  constructor(review: BaselineBoundaryReview, units: Map<string, BoundaryUnit>, accesses: Map<string, BoundaryAccess>,
    rules: Map<string, BoundaryRule>, problem: Problem) {
    this.review = review;
    this.units = units;
    this.accesses = accesses;
    this.rules = rules;
    this.problem = problem;
  }

  coverage(coverage: BoundaryCoverage, path: Path): void {
    for (const [index, id] of coverage.examinedUnitIds.entries()) {
      if (!this.units.has(id)) this.problem([...path, "examinedUnitIds", index], "Expected a reviewed unit.");
    }
    for (const [index, id] of coverage.unresolvedAccessIds.entries()) {
      if (this.accesses.get(id)?.targetUnitId !== null) this.problem([...path, "unresolvedAccessIds", index], "Expected an unresolved access.");
    }
    if (coverage.inventoryRoots && (coverage.status !== "complete" ||
        coverage.inventoryRoots.some(root => !this.review.identity.analysisRoots.some(analysis =>
          analysis === "." || root === analysis || root.startsWith(analysis + "/"))))) {
      this.problem([...path, "inventoryRoots"], "A scoped inventory requires complete coverage inside the captured analysis roots.");
    }
    if (coverage.status === "complete" && (coverage.roots.length === 0 || coverage.accessKinds.length === 0 ||
        coverage.missingRoots.length > 0 || coverage.unresolvedAccessIds.length > 0 || coverage.limitations.length > 0)) {
      this.problem(path, "A complete check needs its roots and supported access kinds, with all relevant inputs accounted for.");
    }
    if (coverage.status !== "complete" && !coverage.limitations.length && !coverage.missingRoots.length && !coverage.unresolvedAccessIds.length) {
      this.problem([...path, "limitations"], "Explain the incomplete or unassessed coverage.");
    }
  }

  private path(check: BoundaryCheck, rule: BoundaryRule, path: Path): void {
    let next = check.sourceUnitId;
    for (const [index, id] of check.accessIds.entries()) {
      const access = this.accesses.get(id);
      if (!access || access.targetUnitId === null || access.context !== check.context ||
          !rule.accessKinds.includes(access.kind)) {
        this.problem([...path, "accessIds", index], "The supporting access must resolve in the checked context and access kinds.");
        return;
      }
      if (rule.kind === "reachability") {
        if (access.callerUnitId !== next) this.problem([...path, "accessIds", index], "Dependency edges must form an ordered path from the checked source.");
      } else if (access.callerUnitId !== check.sourceUnitId || access.targetUnitId !== check.targetUnitId) {
        this.problem([...path, "accessIds", index], "A direct rule must cite an access between the checked units.");
      }
      next = access.targetUnitId;
    }
    if (check.accessIds.length > 0 && next !== check.targetUnitId) this.problem([...path, "accessIds"], "The path must reach the actual checked target.");
  }

  validate(check: BoundaryCheck, path: Path): void {
    const rule = this.rules.get(check.ruleId);
    if (!rule) this.problem([...path, "ruleId"], "Expected an existing boundary rule.");
    for (const field of ["sourceUnitId", "targetUnitId"] as const) {
      if (!this.units.has(check[field])) this.problem([...path, field], "Expected a reviewed unit.");
    }
    this.coverage(check.coverage, [...path, "coverage"]);
    if (!rule) return;
    const overriding = check.exceptionId === undefined ? undefined : this.rules.get(check.exceptionId);
    if (check.exceptionId !== undefined && (overriding?.kind !== "exception" || overriding.overridesRuleId !== rule.id ||
        !["accepted", "repository"].includes(overriding.authority) || check.result !== "allowed")) {
      this.problem([...path, "exceptionId"], "An applicable exception must name this rule and support an allowed result.");
    }
    if (this.review.status === "current" && check.result !== "unknown" &&
        (!["accepted", "repository"].includes(rule.authority) || rule.kind === "unsupported")) {
      this.problem([...path, "result"], "A definitive result requires a supported active rule or accepted decision.");
    }
    if (check.result === "absent" && (check.coverage.status !== "complete" || check.accessIds.length > 0 ||
        !check.coverage.examinedUnitIds.includes(check.sourceUnitId) || !rule.accessKinds.every(kind => check.coverage.accessKinds.includes(kind)))) {
      this.problem([...path, "result"], "An absence result requires a complete applicable search of the checked source and access kinds.");
    }
    if ((check.result === "forbidden" || check.result === "allowed") && check.accessIds.length === 0) {
      this.problem([...path, "accessIds"], "A positive observation must cite the checked access or ordered path.");
    }
    this.path(check, rule, path);
  }
}
