import type { IsolationEvidence } from "./generated/contracts.ts";
import { evidence, key, samePolicy, sameSet, type Check, type IsolationFacts } from "./isolation-facts.ts";

function roots(path: string): string[] {
  const paths = ["."];
  let part = "";
  for (const segment of path.split("/")) { part = part ? part + "/" + segment : segment; paths.push(part); }
  return paths;
}

type Endpoint = "sourceUnitId" | "targetUnitId";
const endpoints: readonly Endpoint[] = ["sourceUnitId", "targetUnitId"];

/** An inventory can prove a unit absent only within a completely reconciled root. */
export class IsolationInventory {
  private readonly proofs = new Map<string, Check>();
  private readonly knownUnits: Set<string>;
  private readonly local: IsolationFacts;
  private readonly other: IsolationFacts;

  constructor(local: IsolationFacts, other: IsolationFacts) {
    this.local = local;
    this.other = other;
    this.knownUnits = new Set(local.identities.units.values());
    const matchedUnits = new Set(other.identities.units.values());
    const ambiguous = new Set<string>();
    for (const [id, common] of local.identities.units) {
      const unit = local.units.get(id);
      if (unit && !matchedUnits.has(common)) roots(unit.path).forEach(path => ambiguous.add(path));
    }
    for (const checks of local.checks.values()) for (const check of checks) {
      if (!check.coverage.inventoryRoots || !local.covers(check)) continue;
      for (const root of check.coverage.inventoryRoots) {
        if (ambiguous.has(root)) continue;
        for (const field of endpoints) this.proofs.set(this.key(local, check, field, root), check);
      }
    }
  }

  private key(side: IsolationFacts, check: Check, fixed: Endpoint, root: string): string {
    return key(side.identities.rules.get(check.ruleId), check.context, check.checker, check.checkerVersion,
      fixed, side.identities.units.get(check[fixed]), root);
  }

  private compatible(proof: Check, check: Check, fixed: Endpoint): boolean {
    const local = this.local, other = this.other;
    const a = local.rules.get(proof.ruleId), b = other.rules.get(check.ruleId);
    const owner = local.owner(proof[fixed]), unit = local.units.get(proof[fixed]), peer = other.units.get(check[fixed]);
    return !!a && !!b && !!unit && !!peer && owner !== undefined && owner === other.owner(check[fixed]) &&
      samePolicy(a, b) && sameSet(unit.roles, peer.roles) && !unit.roles.includes("unknown") &&
      !proof.exceptionId && !check.exceptionId && sameSet(proof.coverage.roots, check.coverage.roots);
  }

  absence(check: Check): IsolationEvidence | null {
    if (!this.proofs.size || !this.other.known(check, this.other.rules.get(check.ruleId))) return null;
    for (const field of endpoints) {
      const identity = this.other.identities.units.get(check[field]), unit = this.other.units.get(check[field]);
      if (!unit || !identity || !unit.ownerId || unit.roles.includes("unknown") || this.knownUnits.has(identity)) continue;
      const fixed = field === "sourceUnitId" ? "targetUnitId" : "sourceUnitId";
      for (const root of roots(unit.path)) {
        const proof = this.proofs.get(this.key(this.other, check, fixed, root));
        if (!proof || !this.compatible(proof, check, fixed)) continue;
        const record = evidence(field === "sourceUnitId" ? null : proof.sourceUnitId,
          field === "targetUnitId" ? null : proof.targetUnitId, proof.ruleId);
        record.coverageIds = [proof.id];
        return record;
      }
    }
    return null;
  }
}
