import type { IsolationChange, IsolationEvidence, IsolationFinding } from "./generated/contracts.ts";
import { authoritative, evidence, samePolicy, sameSet, type Access, type Check, type Rule, type IsolationFacts } from "./isolation-facts.ts";
import { IsolationCoverage } from "./isolation-coverage.ts";
import type { IsolationInventory } from "./isolation-inventory.ts";

interface Witness {
  checks: Set<Check>;
  ids: Set<string>;
}

type Roles = Pick<Access, "callerRole" | "targetRole">;

export function scopeChange(before: readonly Roles[], after: readonly Roles[]): IsolationChange | undefined {
  if (!before.length || !after.length) return;
  const classified = (site: Roles) => site.callerRole !== "unknown" && site.targetRole !== "unknown";
  if (!before.every(classified) || !after.every(classified)) return;
  const production = (site: Roles) => site.callerRole === "production" && site.targetRole === "production";
  if (before.some(production) !== after.some(production)) return before.some(production) ? "Left production scope" : "Entered production scope";
}

/** One rule, matched source and actual target in one resolution context. */
export class CheckedCrossings {
  readonly facts: IsolationFacts;
  readonly first: Check;
  readonly rule: Rule;
  readonly routes = new Map<string, Witness>();
  readonly coverage: IsolationCoverage;

  constructor(facts: IsolationFacts, first: Check, rule: Rule, checks: readonly Check[]) {
    this.facts = facts;
    this.first = first;
    this.rule = rule;
    this.coverage = new IsolationCoverage(facts, checks);
    for (const check of checks) {
      for (const id of check.accessIds) {
        const site = facts.sites.get(id);
        if (!site) continue;
        const route = rule.kind === "reachability" ? "path" : facts.route(site);
        let witness = this.routes.get(route);
        if (!witness) { witness = { checks: new Set(), ids: new Set() }; this.routes.set(route, witness); }
        witness.ids.add(id);
        witness.checks.add(check);
        facts.assessed.add(id);
      }
    }
    const path = this.routes.get("path");
    if (path && [...path.checks].some(check => check.result === "forbidden")) {
      for (const call of facts.callsFor(first)) { path.ids.add(call.id); facts.assessed.add(call.id); }
    }
  }

  static from(facts: IsolationFacts, checks?: readonly Check[]): CheckedCrossings | undefined {
    const first = checks?.[0], rule = first && facts.rules.get(first.ruleId);
    if (first && rule && checks) return new CheckedCrossings(facts, first, rule, checks);
  }

  record(witness?: Witness, proof?: Check): IsolationEvidence {
    const check = proof ?? this.first;
    const record = evidence(check.sourceUnitId, check.targetUnitId, check.ruleId);
    if (witness) {
      record.accessIds = [...witness.ids].sort();
      record.resultIds = [...witness.checks].map(c => c.id).sort();
      record.coverageIds = record.resultIds;
    } else record.coverageIds = [check.id];
    return record;
  }

  verdict(witness?: Witness): "forbidden" | "allowed" | "unknown" | undefined {
    if (!witness) return;
    let allowed = false, forbidden = false;
    for (const check of witness.checks) {
      if (!this.facts.known(check, this.rule)) continue;
      if (check.result === "forbidden") forbidden = true;
      if (check.result === "allowed") allowed = true;
    }
    if (allowed === forbidden) return "unknown";
    return forbidden ? "forbidden" : "allowed";
  }

  withinProof(witness: Witness | undefined, opposite: IsolationFacts, proof: Check): boolean {
    if (!witness) return true;
    // The call that explains a dependency path may lie outside the checker's
    // supported kinds. Use only the graph edges for the reachability proof.
    if (this.rule.kind === "reachability") return this.rule.accessKinds.every(kind => proof.coverage.accessKinds.includes(kind));
    for (const id of witness.ids) {
      const site = this.facts.sites.get(id);
      if (!site || !proof.coverage.accessKinds.includes(site.kind)) return false;
      if (site.operationId) {
        const common = this.facts.identities.operations.get(site.operationId);
        if (!common || !opposite.operationKeys.has(common)) return false;
      }
    }
    return true;
  }

  endpointSites(witness?: Witness): Roles[] {
    if (!witness) return [];
    if (this.rule.kind === "reachability") return [...witness.checks].flatMap(check => {
      const first = this.facts.sites.get(check.accessIds[0] ?? "");
      const last = this.facts.sites.get(check.accessIds.at(-1) ?? "");
      return first && last ? [{ callerRole: first.callerRole, targetRole: last.targetRole }] : [];
    });
    return [...witness.ids].flatMap(id => {
      const site = this.facts.sites.get(id);
      return site?.callerUnitId === this.first.sourceUnitId ? [site] : [];
    });
  }
}

class RecordedSide {
  readonly group: CheckedCrossings;
  readonly witness?: Witness;
  readonly proof?: Check;
  readonly record: IsolationEvidence;
  readonly verdict: ReturnType<CheckedCrossings["verdict"]>;

  constructor(group: CheckedCrossings, route: string, other: CheckedCrossings) {
    this.group = group;
    this.witness = group.routes.get(route);
    const peer = other.routes.get(route);
    const proof = group.coverage.proofFor(other.coverage, peer?.checks ?? [other.first]);
    this.proof = proof && other.withinProof(peer, group.facts, proof) ? proof : undefined;
    this.record = group.record(this.witness, this.proof);
    this.verdict = group.verdict(this.witness);
  }

  exceptions(): Rule[] {
    const ids = new Set([...(this.witness?.checks ?? [this.proof ?? this.group.first])].map(c => c.exceptionId).filter(id => id !== undefined));
    return [...ids].flatMap(id => this.group.facts.rules.get(id) ?? []);
  }
}

function equalExceptions(a: RecordedSide, b: RecordedSide): boolean {
  const old = a.exceptions(), current = b.exceptions();
  if (old.length !== current.length) return false;
  const matched = new Map(current.map(r => [b.group.facts.identities.rules.get(r.id), r]));
  return old.every(rule => {
    const peer = matched.get(a.group.facts.identities.rules.get(rule.id));
    return peer && samePolicy(rule, peer);
  });
}

function endpoints(a: CheckedCrossings, b: CheckedCrossings): "changed-owner" | "uncertain" | "comparable" {
  for (const field of ["sourceUnitId", "targetUnitId"] as const) {
    const left = a.first[field], right = b.first[field];
    const owner = a.facts.owner(left), peer = b.facts.owner(right);
    if (owner && peer && owner !== peer) return "changed-owner";
    const roles = a.facts.units.get(left)?.roles, other = b.facts.units.get(right)?.roles;
    if (!owner || !peer || !roles || !other || roles.includes("unknown") || !sameSet(roles, other)) return "uncertain";
  }
  return "comparable";
}

/** Classify one route. The absence proof comes from the opposite input. */
class CrossingPair {
  readonly before: RecordedSide;
  readonly after: RecordedSide;
  private readonly findings: IsolationFinding[] = [];

  constructor(before: CheckedCrossings, after: CheckedCrossings, route: string) {
    this.before = new RecordedSide(before, route, after);
    this.after = new RecordedSide(after, route, before);
  }

  private add(change: IsolationChange, reason: string): void {
    this.findings.push({ change, reason, before: this.before.record, after: this.after.record });
  }

  private limited(reason: string): void {
    this.add("Comparison limited", (this.after.verdict === "forbidden" ? "First observed in After. " : "") + reason);
  }

  private policyChange(ownerChanged: boolean): boolean {
    const a = this.before, b = this.after;
    const exceptions = equalExceptions(a, b);
    if (!ownerChanged && samePolicy(a.group.rule, b.group.rule) && exceptions) return false;
    if (ownerChanged) this.add("Policy or ownership changed", a.witness && b.witness ? "The direct owner changed." :
      "The direct owner changed. A source change is unverified.");
    else this.add("Policy or ownership changed", exceptions ? "The effective rule changed." : "The applicable exception changed.");
    if (!ownerChanged && a.group.rule.kind === b.group.rule.kind && !a.witness && b.witness && a.proof) this.add("Interface use changed", "A source access was added.");
    if (!ownerChanged && a.group.rule.kind === b.group.rule.kind && a.witness && !b.witness && b.proof) this.add("Interface use changed", "A source access was removed.");
    if (b.verdict === "forbidden" && a.verdict !== "forbidden") this.limited("Policy or ownership changed between the checks.");
    return true;
  }

  private unchangedPolicy(): void {
    const a = this.before, b = this.after;
    if (a.verdict === "unknown" || b.verdict === "unknown") return this.limited("The recorded checks cannot establish the change.");
    if (a.verdict === "forbidden" && b.verdict === "forbidden")
      return this.add("Existing violation", "Both files prove this crossing.");
    if (a.witness && b.witness) {
      if (a.verdict !== b.verdict) this.limited("Both files record the access under the same rule with different results.");
      return;
    }
    if (!a.witness && !b.witness) {
      if (!a.proof || !b.proof) this.limited("The two searches do not establish comparable coverage.");
      return;
    }
    if (!a.witness && a.proof) return b.verdict === "forbidden"
      ? this.add("New violation", "Before completely checked the rule and found no such crossing.")
      : this.add("Interface use changed", "A permitted access was added.");
    if (!b.witness && b.proof) return a.verdict === "forbidden"
      ? this.add("Resolved violation", "The complete After check found no forbidden crossing on this route.")
      : this.add("Interface use changed", "A permitted access was removed.");
    this.limited(a.witness ? "After cannot establish removal." : "Before cannot establish absence.");
  }

  compare(): IsolationFinding[] {
    const a = this.before, b = this.after;
    if (a.group.facts.review.status !== "current" || b.group.facts.review.status !== "current") {
      this.limited("The boundary review needs refresh.");
      return this.findings;
    }
    const area = endpoints(a.group, b.group);
    const changed = this.policyChange(area === "changed-owner");
    const transition = scopeChange(a.group.endpointSites(a.witness), b.group.endpointSites(b.witness));
    if (transition) this.add(transition, "The role of an observed access changed.");
    else if (!changed) {
      const rule = b.group.rule;
      if (!authoritative(rule))
        this.add("Needs review", "The recorded policy does not establish permission.");
      else if (area === "uncertain") this.limited("The endpoint roles or ownership prevent a comparable conclusion.");
      else this.unchangedPolicy();
    }
    return this.findings;
  }
}

export function compareCrossings(before: CheckedCrossings, after: CheckedCrossings): IsolationFinding[] {
  const routes = new Set([...before.routes.keys(), ...after.routes.keys()]);
  if (!routes.size) routes.add("unobserved");
  return [...routes].flatMap(route => new CrossingPair(before, after, route).compare());
}

export function unmatchedCrossings(group: CheckedCrossings, isAfter: boolean, inventory: IsolationInventory): IsolationFinding[] {
  const routes = group.routes.size ? [...group.routes.values()] : [undefined];
  return routes.map(witness => {
    const record = group.record(witness);
    const representative = [...(witness?.checks ?? [])].find(check => group.facts.known(check, group.rule) && check.result === "forbidden");
    const absence = representative ? inventory.absence(representative) : null;
    if (!authoritative(group.rule) && group.facts.review.status === "current") return { change: "Needs review",
      reason: "The recorded policy does not establish permission.", before: isAfter ? null : record, after: isAfter ? record : null };
    const dated = absence && group.verdict(witness) === "forbidden";
    const change = dated ? isAfter ? "New violation" : "Resolved violation" : "Comparison limited";
    const reason = dated ? "The complete scoped inventory establishes the unit's absence." :
      isAfter && representative ? "First observed in After. Before has no comparable check." : "Only one file records a comparable check.";
    return { change, reason, before: isAfter ? absence : record, after: isAfter ? record : absence };
  });
}
