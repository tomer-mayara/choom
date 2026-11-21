import type {
  BaselineV6, BaselineSourceNote, BoundaryAccess, BoundaryCheck, BoundaryOperation, BoundaryRole, BoundarySourceNote, BoundaryUnit,
} from "@choom/baseline-model/contracts";
import type { ReadonlyData } from "@choom/baseline-model/readonly-data";
import type { InterfaceArc } from "./interface-arcs.ts";

export const roleNames: Record<BoundaryRole, string> = {
  production: "Production", test: "Test", development: "Developer tool", build: "Build", ci: "CI",
  benchmark: "Benchmark", example: "Example", environment: "Environment check", unknown: "Scope unknown",
};

const accessKinds = {
  call: "Call", import: "Import", "re-export": "Re-export", "dynamic-import": "Dynamic import", require: "Require", type: "Type use",
} as const;

type ReviewedFile = ReadonlyData<BaselineV6>;
type Unit = ReadonlyData<BoundaryUnit>;
type Access = ReadonlyData<BoundaryAccess>;
type SourceNote = ReadonlyData<BaselineSourceNote | BoundarySourceNote>;

export interface VisibleSite {
  id: string;
  kind: string;
  role: BoundaryRole;
  targetRole: BoundaryRole;
  member: string;
  route?: string;
  caller: string;
  target?: string;
  targetId?: string;
  operationId?: string;
  location?: string;
  notes: SourceNote[];
  reason?: string;
}

export interface CallerSites {
  id: string;
  name: string;
  sites: VisibleSite[];
}

export interface VisibleOperation {
  id: string;
  name: string;
  owner: string | null;
  ownerName: string;
  roles: readonly BoundaryRole[];
  visibility: string;
  reason?: string;
  permittedCallers: string[] | null;
  callers: Map<BoundaryRole, CallerSites[]>;
  completeProductionSearch: boolean;
  markers: string[];
  notes: SourceNote[];
  interfaceId?: string;
}

interface ScopeFinding {
  id: string;
  label: string;
  rule: string;
  target?: string;
  role: BoundaryRole;
  sites: VisibleSite[];
  callerLocation?: string;
}

export interface ReviewedComponent {
  id: string;
  name: string;
  purpose: string;
  roleLabel: string;
  reason?: string;
  provides: VisibleOperation[];
  uses: VisibleSite[];
  findings: ScopeFinding[];
  notes: SourceNote[];
}

function rolesForView(roles: readonly BoundaryRole[], showAll: boolean): readonly BoundaryRole[] {
  return showAll ? roles : roles.filter((role) => role === "production");
}

function componentRole(roles: readonly BoundaryRole[], basis?: string): string {
  if (roles.length > 1) return "Mixed scope";
  if (roles[0] === "test" && (basis === "declaration" || basis === "complete-review")) return "Test component";
  return roleNames[roles[0] ?? "unknown"];
}

function indexNotes(baseline: ReviewedFile): Map<string, SourceNote> {
  const notes = new Map<string, SourceNote>();
  for (const group of [...baseline.interfaces.map((item) => item.documentation), ...baseline.sourceUsage?.assessments ?? []])
    for (const note of group?.sourceNotes ?? []) notes.set(note.evidenceRef, note);
  for (const note of baseline.boundaryReview.sourceNotes) notes.set(note.evidenceRef, note);
  return notes;
}

/** One projection provides the cards, inspector, connections and site counts for one scope. */
export class BoundaryInventory {
  readonly components = new Map<string, ReviewedComponent>();
  readonly operations = new Map<string, VisibleOperation>();
  readonly findings: { caller: string; finding: ScopeFinding }[] = [];
  readonly arcs: InterfaceArc[] = [];
  readonly unresolved: VisibleSite[] = [];
  readonly arcLabels = new Map<string, string>();
  private readonly units: Map<string, Unit>;
  private readonly notes: Map<string, SourceNote>;
  private readonly owners: Map<string, string>;
  private readonly sites = new Map<string, VisibleSite>();
  private readonly accessById: Map<string, Access>;
  private readonly rules: Map<string, string>;
  private readonly callers = new Map<string, CallerSites>();
  private readonly declaredMembers = new Map<string, VisibleOperation>();
  private readonly arcRoles = new Map<string, Set<string>>();
  readonly fresh: boolean;

  readonly baseline: ReviewedFile;
  readonly showAll: boolean;
  readonly fileDigest?: string;
  constructor(baseline: ReviewedFile, showAll: boolean, fileDigest?: string) {
    this.baseline = baseline;
    this.showAll = showAll;
    this.fileDigest = fileDigest;
    const review = baseline.boundaryReview;
    this.accessById = new Map(review.accesses.map((access) => [access.id, access]));
    this.rules = new Map(review.rules.map((rule) => [rule.id, rule.name]));
    this.fresh = review.status === "current";
    this.units = new Map(review.units.map((unit) => [unit.id, unit]));
    this.notes = indexNotes(baseline);
    this.owners = new Map(review.units.flatMap((unit) => unit.ownerId ? [[unit.id, unit.ownerId] as const] : []));
    this.readComponents();
    if (!this.fresh) return;
    this.readOperations();
    if (showAll) this.readUnclassifiedInterfaces();
    for (const access of review.accesses) this.readSite(access);
    for (const check of review.checks) this.readFinding(check);
    for (const arc of this.arcs) {
      const roles = this.arcRoles.get(arc.id) ?? [];
      this.arcLabels.set(arc.id, [this.operations.get(arc.interfaceId)?.name, ...roles].join(" · "));
    }
  }

  private readComponents(): void {
    const scopes = new Map(this.baseline.boundaryReview.componentScopes.map((scope) => [scope.componentId, scope]));
    for (const component of this.baseline.components) {
      const scope = scopes.get(component.id);
      const roles = rolesForView(scope?.roles ?? ["unknown"], this.showAll);
      if (!roles.length || (!this.showAll && !this.fresh)) continue;
      this.components.set(component.id, {
        id: component.id, name: scope?.name ?? component.name, purpose: scope?.purpose ?? component.purpose.value,
        roleLabel: componentRole(roles, scope?.basis), reason: this.showAll ? scope?.reason ?? (scope ? undefined : "No component scope review was recorded.") : undefined,
        provides: [], uses: [], findings: [], notes: this.siteNotes(scope?.evidenceRefs ?? []),
      });
    }
  }

  private siteNotes(refs: readonly string[]): SourceNote[] {
    return this.showAll ? [...new Set(refs)].flatMap((ref) => this.notes.get(ref) ?? []) : [];
  }

  private readOperations(): void {
    const review = this.baseline.boundaryReview;
    const interfaces = new Map(this.baseline.interfaces.map((item) => [item.id, item]));
    const markers = new Map(this.baseline.systemEntryPoints?.entries.map((entry) => [entry.id, entry.kind]));
    const complete = new Set(review.callerSearches.filter((search) => search.role === "production"
      && search.coverage.status === "complete").map((search) => search.operationId));
    for (const operation of review.operations) {
      const component = this.components.get(this.owners.get(operation.unitId) ?? "");
      const roles = rolesForView(operation.roles, this.showAll);
      if ((!component && !this.showAll) || !roles.length) continue;
      const permitted = interfaces.get(operation.interfaceId ?? "")?.allowedConsumers.value;
      const visible: VisibleOperation = {
        id: operation.id, name: operation.name, owner: component?.id ?? null, ownerName: component?.name ?? "Owner unknown", roles, visibility: operation.visibility,
        reason: this.showAll ? operation.reason : undefined, interfaceId: operation.interfaceId, notes: this.siteNotes(operation.evidenceRefs),
        permittedCallers: permitted?.flatMap((id) => this.components.get(id)?.name ?? []) ?? null,
        callers: new Map(), completeProductionSearch: complete.has(operation.id),
        markers: [...new Set(operation.systemEntryIds?.flatMap((id) => markers.get(id) ?? []))],
      };
      this.addOperation(operation, visible, component);
    }
  }

  private readUnclassifiedInterfaces(): void {
    const classified = new Set(this.baseline.boundaryReview.operations.map(({ interfaceId }) => interfaceId));
    for (const item of this.baseline.interfaces) {
      if (classified.has(item.id)) continue;
      const component = this.components.get(item.owner.value ?? "");
      const operation: VisibleOperation = {
        id: `interface:${item.id}`, interfaceId: item.id, name: item.name, owner: item.owner.value, ownerName: component?.name ?? "Owner unknown",
        roles: ["unknown"], reason: "The review did not classify this interface.", visibility: "unknown",
        permittedCallers: item.allowedConsumers.value?.flatMap((id) => this.components.get(id)?.name ?? []) ?? null,
        callers: new Map(), completeProductionSearch: false, markers: [], notes: [],
      };
      component?.provides.push(operation);
      this.operations.set(operation.id, operation);
    }
  }

  private addOperation(declaration: Pick<BoundaryOperation, "unitId" | "member">, visible: VisibleOperation, component?: ReviewedComponent): void {
    this.declaredMembers.set(JSON.stringify([declaration.unitId, declaration.member]), visible);
    component?.provides.push(visible);
    this.operations.set(visible.id, visible);
  }

  private operationFor(access: Access, target: ReviewedComponent): VisibleOperation | undefined {
    if (access.operationId) return this.operations.get(access.operationId);
    const key = JSON.stringify([access.targetUnitId, access.member]);
    const known = this.declaredMembers.get(key);
    if (known) return known;
    if (!access.targetUnitId || target.id === this.owners.get(access.callerUnitId)) return undefined;
    const name = access.member ?? (this.showAll ? access.writtenPath : "Module");
    const operation: VisibleOperation = {
      id: `observed:${key}`, name, owner: target.id, ownerName: target.name, roles: [access.targetRole],
      visibility: "unknown", markers: [], notes: [], callers: new Map(), permittedCallers: null, completeProductionSearch: false,
    };
    this.addOperation({ unitId: access.targetUnitId, member: access.member ?? "" }, operation, target);
    return operation;
  }

  private readSite(access: Access): void {
    const caller = this.components.get(this.owners.get(access.callerUnitId) ?? "");
    const target = this.components.get(this.owners.get(access.targetUnitId ?? "") ?? "");
    if (!this.showAll && (!caller || !target || access.callerRole !== "production" || access.targetRole !== "production")) return;
    if (!caller || !target) {
      this.unresolved.push({
        ...this.describeSite(access, caller?.name ?? "Caller unknown", target),
        reason: access.reason ?? "The caller or target has no resolved owner.",
      });
      return;
    }
    const operation = target && this.operationFor(access, target);
    if (!this.showAll && access.operationId && !operation) return;
    const site = this.describeSite(access, caller.name, target, operation);
    this.sites.set(access.id, site);
    caller.uses.push(site);
    if (!operation || !target) return;
    this.addArc(operation, caller, target, access);
    if (caller.id === target.id) return;
    const key = JSON.stringify([operation.id, access.callerRole, caller.id]);
    let group = this.callers.get(key);
    if (!group) {
      group = { id: caller.id, name: caller.name, sites: [] };
      this.callers.set(key, group);
      const groups = operation.callers.get(access.callerRole) ?? [];
      groups.push(group);
      operation.callers.set(access.callerRole, groups);
    }
    group.sites.push(site);
  }

  private describeSite(access: Access, caller: string, target?: ReviewedComponent, operation?: VisibleOperation): VisibleSite {
    const location = this.notes.get(access.callerRef)?.location;
    const lines = location ? `lines ${location.lines.join("–")}` : undefined;
    return {
      id: access.id, caller, target: target?.name, targetId: target?.id, operationId: operation?.id, member: access.member ?? operation?.name ?? "Unresolved operation",
      kind: accessKinds[access.kind], role: access.callerRole, targetRole: access.targetRole, route: this.showAll ? access.writtenPath : undefined,
      location: this.showAll && location ? `${location.path}, ${lines}` : lines, reason: this.showAll ? access.reason : undefined,
      notes: this.siteNotes([access.callerRef, ...access.evidenceRefs, ...access.emittedCopies?.flatMap((copy) => [copy.sourceRef, copy.emittedRef, copy.proofRef]) ?? []]),
    };
  }

  private addArc(operation: VisibleOperation, caller: ReviewedComponent, target: ReviewedComponent, access: Access): void {
    const id = JSON.stringify([operation.id, caller.id, target.id]);
    const role = access.callerRole === access.targetRole ? roleNames[access.callerRole] : `${roleNames[access.callerRole]} → ${roleNames[access.targetRole]}`;
    const roles = this.arcRoles.get(id);
    if (roles) { roles.add(role); return; }
    this.arcRoles.set(id, new Set([role]));
    this.arcs.push({ id, interfaceId: operation.id, consumerId: caller.id, ownerId: target.id });
  }

  private readFinding(check: ReadonlyData<BoundaryCheck>): void {
    if (check.result !== "forbidden" && check.result !== "unknown") return;
    const caller = this.components.get(this.owners.get(check.sourceUnitId) ?? "");
    if (!caller) return;
    const first = this.accessById.get(check.accessIds[0] ?? "");
    const role = first?.callerRole ?? this.unitRole(check.sourceUnitId);
    if (!this.showAll && role !== "production") return;
    const target = this.components.get(this.owners.get(check.targetUnitId) ?? "");
    const excluded = !this.showAll && (!target || this.terminalRole(check) !== "production");
    if (excluded && check.result !== "forbidden") return;
    const label = excluded ? "Production code reaches an excluded target" : check.result === "unknown" ? "Needs review" : "Forbidden access";
    const sites = excluded ? [] : check.accessIds.flatMap((id) => this.sites.get(id) ?? []);
    const rule = excluded ? "A production dependency crosses a restricted boundary." : this.rules.get(check.ruleId) ?? "Rule unknown";
    const callerLocation = this.callerLocation(first);
    const finding = { id: check.id, label, rule, target: excluded ? undefined : target?.name, role, sites, callerLocation };
    caller.findings.push(finding);
    this.findings.push({ caller: caller.name, finding });
  }

  private callerLocation(site: Access | undefined): string | undefined {
    const lines = site && this.notes.get(site.callerRef)?.location?.lines;
    return lines ? `Caller lines ${lines.join("–")}` : undefined;
  }

  private unitRole(id: string): BoundaryRole {
    return this.units.get(id)?.roles[0] ?? "unknown";
  }

  private terminalRole(check: ReadonlyData<BoundaryCheck>): BoundaryRole {
    const last = this.accessById.get(check.accessIds.at(-1) ?? "");
    return last?.targetRole ?? this.unitRole(check.targetUnitId);
  }
}
