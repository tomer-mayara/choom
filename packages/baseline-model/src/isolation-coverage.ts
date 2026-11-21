import { key, type Check, type IsolationFacts } from "./isolation-facts.ts";

interface Area {
  profile: string;
  members: ReadonlySet<string>;
  signature: string;
}

interface Proof { check: Check; area: Area }

/** Index complete rule searches by checker configuration and matched scope. A
 * positive witness may examine a subset of an otherwise completely checked area. */
export class IsolationCoverage {
  private readonly areas = new Map<Check, Area>();
  private readonly exact = new Map<string, Check>();
  private readonly largest = new Map<string, Proof>();

  constructor(facts: IsolationFacts, checks: readonly Check[]) {
    const membership = new Map<string, string>();
    for (const check of checks) {
      const members = new Set<string>();
      for (const id of check.coverage.examinedUnitIds) {
        let member = membership.get(id);
        if (!member) {
          const roles = facts.units.get(id)?.roles ?? [];
          member = key(facts.identities.units.get(id), facts.owner(id), [...roles].sort());
          membership.set(id, member);
        }
        members.add(member);
      }
      const profile = key(check.checker, check.checkerVersion, [...check.coverage.roots].sort());
      const area = { profile, members, signature: key(profile, [...members].sort()) };
      this.areas.set(check, area);
      if (!facts.covers(check)) continue;
      this.exact.set(area.signature, check);
      const largest = this.largest.get(profile);
      if (!largest || largest.area.members.size < members.size) this.largest.set(profile, { check, area });
    }
  }

  proofFor(other: IsolationCoverage, checks: Iterable<Check>): Check | undefined {
    for (const check of checks) {
      const area = other.areas.get(check);
      if (!area) continue;
      const exact = this.exact.get(area.signature);
      if (exact) return exact;
      const broad = this.largest.get(area.profile);
      if (broad && area.members.size <= broad.area.members.size && [...area.members].every(id => broad.area.members.has(id)))
        return broad.check;
    }
  }
}
