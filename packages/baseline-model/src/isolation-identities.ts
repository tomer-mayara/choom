import type { BoundaryMatch, BoundaryUnit } from "./generated/contracts.ts";
import { groupBy, key, type FactKeys, type Review } from "./isolation-facts.ts";
import type { ReadonlyData } from "./readonly-data.ts";

interface NamedRecord { readonly id: string; readonly stableId?: string }
class MatchedKeys<T extends NamedRecord> {
  readonly before: Map<string, string>;
  readonly after: Map<string, string>;
  private readonly claimed = new Set<string>();

  constructor(before: readonly T[], after: readonly T[]) {
    this.before = new Map(before.map(({ id }) => [id, key("before", id)]));
    this.after = new Map(after.map(({ id }) => [id, key("after", id)]));
  }

  uniquely(before: readonly T[], after: readonly T[], leftKey: (item: T) => string | undefined,
    rightKey = leftKey): void {
    const left = groupBy(before, (item) => leftKey(item) ?? ""), right = groupBy(after, (item) => rightKey(item) ?? "");
    for (const [name, values] of left) {
      const other = right.get(name);
      if (!name || values.length !== 1 || other?.length !== 1) continue;
      const [a] = values, [b] = other;
      if (!a || !b) continue;
      if (a.stableId && b.stableId && a.stableId !== b.stableId) continue;
      this.bind(a.id, b.id);
    }
  }

  bind(a: string, b: string): void {
    if (this.claimed.has(a) || this.after.get(b) !== key("after", b)) return;
    const common = this.before.get(a);
    if (common) { this.after.set(b, common); this.claimed.add(a); }
  }
}

type Match = ReadonlyData<BoundaryMatch>;
const pathKey = (u: ReadonlyData<BoundaryUnit>) => key(u.unitKind, u.path, u.symbol);
const declaration = (item: NamedRecord) => item.stableId;

function reviewedMatches(older: Review, newer: Review, digest: string, entity: "unit" | "member",
  apply: (oldId: string, newId: string) => void): void {
  if (newer.identity.referenceDigest !== digest) return;
  const address = (path: string, symbol?: string, member?: string) => key(path, symbol, member);
  const units = new Map(older.units.map((u) => [u.id, u]));
  const items = entity === "unit" ? older.units.map((u) => ({ address: address(u.path, u.symbol), id: u.id }))
    : older.operations.flatMap(op => {
      const u = units.get(op.unitId);
      return u ? [{ address: address(u.path, u.symbol, op.member), id: op.id }] : [];
    });
  const candidates = newer.matches.filter((m) => m.referenceDigest === digest && (entity === "unit" ? !m.operationId : !!m.operationId));
  const target = (m: Match) => m.operationId ?? m.unitId;
  const byOrigin = groupBy(candidates, (m) => address(m.oldPath, m.oldSymbol, m.oldMember));
  const byTarget = groupBy(candidates, target);
  const byAddress = groupBy(items, (i) => i.address);
  for (const [addr, matches] of byOrigin) {
    const [match] = matches, old = byAddress.get(addr);
    if (match && matches.length === 1 && old?.length === 1 && old[0] && byTarget.get(target(match))?.length === 1)
      apply(old[0].id, target(match));
  }
}

export function matchedKeys(a: Review, b: Review, beforeDigest: string, afterDigest: string): [FactKeys, FactKeys] {
  const units = new MatchedKeys(a.units, b.units), ops = new MatchedKeys(a.operations, b.operations);
  units.uniquely(a.units, b.units, declaration);
  reviewedMatches(a, b, beforeDigest, "unit", (x, y) => units.bind(x, y));
  reviewedMatches(b, a, afterDigest, "unit", (y, x) => units.bind(x, y));
  units.uniquely(a.units, b.units, pathKey);
  ops.uniquely(a.operations, b.operations, declaration);
  reviewedMatches(a, b, beforeDigest, "member", (x, y) => ops.bind(x, y));
  reviewedMatches(b, a, afterDigest, "member", (y, x) => ops.bind(x, y));
  ops.uniquely(a.operations, b.operations, (o) => key(units.before.get(o.unitId), o.member),
    (o) => key(units.after.get(o.unitId), o.member));
  const ruleKeys = new MatchedKeys(a.rules, b.rules);
  ruleKeys.uniquely(a.rules, b.rules, (r) => key(r.kind === "exception" ? "exception" : "rule", r.settings.name ?? r.name));
  ruleKeys.uniquely(a.rules, b.rules, (r) => r.name);
  const names = (review: Review) => review.componentScopes.map((c) => ({ id: c.componentId, name: c.name }));
  const ownersA = names(a), ownersB = names(b), owners = new MatchedKeys(ownersA, ownersB);
  owners.uniquely(ownersA, ownersB, (c) => c.id);
  owners.uniquely(ownersA, ownersB, (c) => c.name);
  return [{ units: units.before, operations: ops.before, owners: owners.before, rules: ruleKeys.before },
    { units: units.after, operations: ops.after, owners: owners.after, rules: ruleKeys.after }];
}
