import type {
  BaselineSourceNote, BaselineV6, BoundaryCheck, BoundaryRole, IsolationEvidence, IsolationFinding,
} from "@choom/baseline-model/contracts";
import type { ReadonlyData } from "@choom/baseline-model/readonly-data";
import { baselineStatements, type StatementState } from "@choom/baseline-model/item-statements";
import { roleNames } from "./boundary-inventory.ts";

type Saved<T> = ReadonlyData<T>;
const kindNames = { call: "Call", type: "Type use", import: "Import", require: "Require", "dynamic-import": "Dynamic import", "re-export": "Re-export" };

export interface ComparisonSide {
  caller: string;
  target: string;
  rule?: string;
  roles: string[];
  evidence: string[];
}

export interface VisibleChange {
  finding: Saved<IsolationFinding>;
  before?: ComparisonSide;
  after?: ComparisonSide;
}

export class IsolationEvidenceView {
  private readonly units;
  private readonly components;
  private readonly operations;
  private readonly sites;
  private readonly rules;
  private readonly checks;
  private readonly notes: Map<string, Saved<BaselineSourceNote>>;
  private readonly statements: Map<string, StatementState>;
  private readonly file: Saved<BaselineV6>;
  private readonly showAll: boolean;

  constructor(file: Saved<BaselineV6>, showAll: boolean) {
    this.file = file;
    this.showAll = showAll;
    const review = file.boundaryReview;
    this.statements = new Map(baselineStatements(file).map(item => [item.itemId + "." + item.field, item.statement]));
    this.units = new Map(review.units.map(unit => [unit.id, unit]));
    this.components = new Map(review.componentScopes.map(scope => [scope.componentId, scope]));
    this.operations = new Map(review.operations.map(operation => [operation.id, operation]));
    this.sites = new Map(review.accesses.map(site => [site.id, site]));
    this.rules = new Map(review.rules.map(rule => [rule.id, rule]));
    this.checks = new Map(review.checks.map(check => [check.id, check]));
    const notes = [...file.interfaces.flatMap(item => item.documentation?.sourceNotes ?? []),
      ...file.sourceUsage?.assessments.flatMap(item => item.sourceNotes) ?? [], ...review.sourceNotes];
    this.notes = new Map(notes.map(note => [note.evidenceRef, note]));
    for (const entry of file.systemEntryPoints?.entries ?? []) {
      if (entry.source && !this.notes.has(entry.source.evidenceRef)) this.notes.set(entry.source.evidenceRef,
        { ...entry.source, description: entry.label });
    }
  }

  private unit(id: string | null) {
    const unit = this.units.get(id ?? "");
    const owner = this.components.get(unit?.ownerId ?? "");
    const visible = this.showAll || (owner?.roles.includes("production") && unit?.roles.includes("production"));
    return visible && unit ? { unit, name: owner?.name ?? unit.path } : undefined;
  }

  private detailsForCheck(check: Saved<BoundaryCheck>): string[] {
    const { coverage } = check;
    const status = { complete: "Complete search", partial: "Partial search", unassessed: "Search unassessed" }[coverage.status];
    const lines = [`${status} · ${coverage.accessKinds.map(kind => kindNames[kind]).join(", ") || "No checked access kinds"}`];
    if (this.showAll) {
      lines.push(`Checker · ${check.checker} ${check.checkerVersion} · ${check.context}`);
      if (coverage.roots.length) lines.push(`Roots · ${coverage.roots.join(", ")}`);
      if (coverage.missingRoots.length) lines.push(`Missing roots · ${coverage.missingRoots.join(", ")}`);
      lines.push(...coverage.limitations);
      for (const ref of check.evidenceRefs) {
        const note = this.notes.get(ref);
        if (note?.location) lines.push(`${note.description} · ${note.location.path} · lines ${note.location.lines.join("–")}`);
      }
      if (check.exceptionId) lines.push(`Exception · ${this.rules.get(check.exceptionId)?.name ?? check.exceptionId}`);
    }
    return lines;
  }

  private describeSite(siteId: string) {
    const site = this.sites.get(siteId);
    if (!site) return undefined;
    const source = this.unit(site.callerUnitId);
    if (!source || (!this.showAll && site.callerRole !== "production")) return undefined;
    const target = this.unit(site.targetUnitId);
    const operation = this.operations.get(site.operationId ?? "");
    const targetVisible = this.showAll || (target && site.targetRole === "production" && (!operation || operation.roles.includes("production")));
    const member = targetVisible ? operation?.name ?? site.member ?? target?.name ?? "Unresolved target" : undefined;
    const note = this.notes.get(site.callerRef);
    const line = note?.location ? `lines ${note.location.lines.join("–")}` : undefined;
    const where = this.showAll && note?.location ? `${note.location.path}, ${line}` : line;
    const description = [kindNames[site.kind], member ?? "Excluded target", roleNames[site.callerRole], source.name, where];
    if (this.showAll) description.push(site.writtenPath, roleNames[site.targetRole], note?.description);
    return { description: description.filter(Boolean).join(" · "), member, role: site.callerRole };
  }

  private statement(ref: string): ComparisonSide | undefined {
    const itemId = ref.split(".", 1)[0] ?? "";
    const component = this.components.get(itemId);
    const item = this.statements.get(ref);
    if (!item || (!this.showAll && component && !component.roles.includes("production"))) return undefined;
    const field = ref.slice(itemId.length + 1);
    const labels: Record<string, string> = { allowedConsumers: "Permitted callers", membership: "Membership", owner: "Owner",
      publicAccess: "Public access", subject: "Rule subject", expected: "Rule policy", check: "Rule check" };
    const authority = item.status === "accepted" ? "Accepted" : "Proposed";
    const evidence = this.showAll ? [ref, JSON.stringify(item.value), ...item.evidenceRefs, ...item.acceptanceRef ? [item.acceptanceRef] : []] : [];
    return { caller: component?.name ?? "Boundary policy", target: labels[field] ?? "Reviewed statement",
      rule: authority, roles: [], evidence };
  }

  private callerRoles(record: Saved<IsolationEvidence>, checks: readonly Saved<BoundaryCheck>[]): BoundaryRole[] {
    const firstEdges = checks.flatMap(check => this.sites.get(check.accessIds[0] ?? "") ?? []);
    return firstEdges.length ? firstEdges.map(site => site.callerRole) : record.accessIds.flatMap(id => {
      const site = this.sites.get(id);
      return site?.callerUnitId === record.callerUnitId ? [site.callerRole] : [];
    });
  }

  private targetMember(record: Saved<IsolationEvidence>, ordered: string[], target: boolean) {
    const targetSites = ordered.filter(id => this.sites.get(id)?.targetUnitId === record.targetUnitId)
      .flatMap(id => this.describeSite(id) ?? []);
    const member = targetSites.find(site => site.member)?.member;
    const hiddenTarget = !this.showAll && (!target || (targetSites.length > 0 && !member));
    return { member, hiddenTarget };
  }

  describe(record: Saved<IsolationEvidence> | null): ComparisonSide | undefined {
    if (!record) return undefined;
    if (record.statementRef) return this.statement(record.statementRef);
    if (this.file.boundaryReview.status === "needs-refresh" && !this.showAll) return undefined;
    const caller = this.unit(record.callerUnitId);
    const target = this.unit(record.targetUnitId);
    if (!caller && !this.showAll) return undefined;
    const checks = record.resultIds.flatMap(id => this.checks.get(id) ?? []);
    // Include the checker's edge order first, followed by any additional call sites.
    const ordered = [...new Set([...checks.flatMap(check => check.accessIds), ...record.accessIds])];
    const sites = ordered.flatMap(id => this.describeSite(id) ?? []);
    const firstRoles = this.callerRoles(record, checks);
    if (!this.showAll && firstRoles.length && !firstRoles.includes("production")) return undefined;
    const roles: readonly BoundaryRole[] = firstRoles.length ? firstRoles : caller?.unit.roles ?? ["unknown"];
    const { member, hiddenTarget } = this.targetMember(record, ordered, Boolean(target));
    const coverage = record.coverageIds.flatMap(id => this.checks.get(id) ?? []).flatMap(check => this.detailsForCheck(check));
    const rule = this.rules.get(record.ruleId ?? "");
    return {
      caller: caller?.name ?? "Owner unknown",
      target: hiddenTarget ? "Production code reaches an excluded target" : member ?? target?.name ?? "Unresolved target",
      rule: hiddenTarget && rule ? "Boundary rule for an excluded target" : rule?.name,
      roles: [...new Set(roles.filter(role => this.showAll || role === "production").map(role => roleNames[role]))],
      evidence: [...coverage, ...sites.map(site => site.description)],
    };
  }
}
