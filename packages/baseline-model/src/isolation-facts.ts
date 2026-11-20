import type { BaselineBoundaryReview, BoundaryAccess, BoundaryCheck, BoundaryCoverage, BoundaryRule, IsolationEvidence } from "./generated/contracts.ts";
import { sameJsonData } from "./json-data.ts";
import type { ReadonlyData } from "./readonly-data.ts";

export interface FactKeys {
  units: ReadonlyMap<string, string>;
  operations: ReadonlyMap<string, string>;
  owners: ReadonlyMap<string, string>;
  rules: ReadonlyMap<string, string>;
}

type Recorded<T> = ReadonlyData<T>;
export type Review = Recorded<BaselineBoundaryReview>;
export type Access = Recorded<BoundaryAccess>;
export type Check = Recorded<BoundaryCheck>;
export type Rule = Recorded<BoundaryRule>;
export const key = (...values: unknown[]): string => JSON.stringify(values);

export function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const values = new Set(left);
  return values.size === new Set(right).size && right.every(value => values.has(value));
}

function sufficient(coverage: Recorded<BoundaryCoverage>, kinds: readonly BoundaryAccess["kind"][]): boolean {
  return coverage.status === "complete" && !coverage.missingRoots.length && !coverage.unresolvedAccessIds.length
    && !coverage.limitations.length && coverage.roots.length > 0 && kinds.every(kind => coverage.accessKinds.includes(kind));
}

export function authoritative(rule: Rule): boolean {
  return rule.kind !== "unsupported" && (rule.authority === "repository" || rule.authority === "accepted");
}

// Revision identifies the cited source bytes. Whitespace or unrelated edits to
// the same rule file can change those bytes without changing an effective rule.
export function samePolicy(left: Rule, right: Rule): boolean {
  return left.kind === right.kind && left.authority === right.authority
    && left.scope === right.scope && sameSet(left.accessKinds, right.accessKinds) && sameJsonData(left.settings, right.settings)
    && left.acceptanceRef === right.acceptanceRef && left.statementRef === right.statementRef;
}

export function groupBy<T>(items: Iterable<T>, identify: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const id = identify(item);
    const group = groups.get(id);
    if (group) group.push(item);
    else groups.set(id, [item]);
  }
  return groups;
}

export function evidence(callerUnitId: string | null, targetUnitId: string | null, ruleId: string | null): IsolationEvidence {
  return { callerUnitId, targetUnitId, ruleId, accessIds: [], resultIds: [], coverageIds: [] };
}

export class IsolationFacts {
  readonly review: Review;
  readonly identities: FactKeys;
  readonly rules: ReadonlyMap<string, Rule>;
  readonly units: ReadonlyMap<string, Review["units"][number]>;
  readonly sites: ReadonlyMap<string, Access>;
  readonly checks: Map<string, Check[]>;
  readonly observed: Map<string, Access[]>;
  readonly assessed = new Set<string>();
  readonly operationKeys: ReadonlySet<string>;
  private readonly calls: Map<string, Access[]>;
  private readonly callOwner = new Map<string, string>();

  constructor(review: Review, identities: FactKeys) {
    this.review = review;
    this.identities = identities;
    this.operationKeys = new Set(identities.operations.values());
    this.units = new Map(review.units.map(unit => [unit.id, unit]));
    this.rules = new Map(review.rules.map(rule => [rule.id, rule]));
    this.sites = new Map(review.accesses.map(site => [site.id, site]));
    this.calls = groupBy(review.accesses.filter(site => site.kind === "call"), site => key(site.callerUnitId, site.targetUnitId, site.context));
    this.observed = groupBy(review.accesses, site => key(identities.units.get(site.callerUnitId),
      identities.units.get(site.targetUnitId ?? ""), this.route(site), site.context));
    this.checks = groupBy([...review.checks].sort((a, b) => a.id.localeCompare(b.id, "en")), check =>
      key(identities.rules.get(check.ruleId), identities.units.get(check.sourceUnitId), identities.units.get(check.targetUnitId), check.context));
    for (const checks of this.checks.values()) {
      const first = checks.find(check => check.result === "forbidden" && this.rules.get(check.ruleId)?.kind === "reachability");
      if (!first) continue;
      const endpoint = key(first.sourceUnitId, first.targetUnitId, first.context);
      if (!this.callOwner.has(endpoint)) this.callOwner.set(endpoint, first.ruleId);
    }
  }

  // A supporting call explains an ordered reachability path. Store it once even
  // if many different rules forbid that same path.
  callsFor(check: Check): readonly Access[] {
    const endpoint = key(check.sourceUnitId, check.targetUnitId, check.context);
    return this.callOwner.get(endpoint) === check.ruleId ? this.calls.get(endpoint) ?? [] : [];
  }

  owner(id: string): string | undefined { return this.identities.owners.get(this.units.get(id)?.ownerId ?? ""); }

  route(site: Access): string {
    return key(site.operationId ? this.identities.operations.get(site.operationId) : site.member, site.writtenPath, site.kind);
  }

  known(check: Check, rule: Rule | undefined): boolean {
    if (!rule || this.review.status !== "current" || !authoritative(rule) || check.result === "unknown") return false;
    return check.accessIds.every(id => {
      const site = this.sites.get(id);
      return site && rule.accessKinds.includes(site.kind);
    });
  }

  covers(check: Check, rule = this.rules.get(check.ruleId)): boolean {
    return !!rule && this.known(check, rule) && sufficient(check.coverage, rule.accessKinds)
      && check.coverage.examinedUnitIds.includes(check.sourceUnitId);
  }

  observedEvidence(sites: readonly Access[]): IsolationEvidence | null {
    const first = sites[0];
    if (!first) return null;
    const result = evidence(first.callerUnitId, first.targetUnitId, null);
    result.accessIds = sites.map(site => site.id).sort();
    return result;
  }

  fullyChecked(): boolean {
    const checked = new Set(this.review.checks.map(check => check.ruleId));
    return this.review.status === "current" && !this.review.limitations.length && checked.size > 0 &&
      this.review.rules.every(rule => rule.kind === "exception" || checked.has(rule.id)) &&
      this.review.checks.every(check => this.covers(check));
  }
}
