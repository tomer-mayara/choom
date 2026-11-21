import type { z } from "zod";
import { BoundaryChecks } from "./boundary-checks.ts";
import type {
  Baseline, BaselineBoundaryReview, BaselineSourceLocation, BaselineSourceUse, BaselineV6, BoundaryAccess,
  BoundaryComponentScope, BoundaryOperation, BoundaryRule, BoundaryUnit,
} from "./generated/contracts.ts";
import { baselineStatements } from "./item-statements.ts";
import { utf8Length } from "./utf8-limits.ts";

type Path = (string | number)[];
type Issue = (path: Path, message: string) => void;
const key = (...parts: unknown[]): string => JSON.stringify(parts);
const unitKey = (unit: BoundaryUnit) => key(unit.path, unit.unitKind, unit.symbol);
const siteKey = (value: BaselineSourceLocation) => key(value.path, value.sha256.toLowerCase(), value.lines);

class ReviewReferences {
  private readonly review: BaselineBoundaryReview;
  private readonly notes = new Map<string, BaselineSourceLocation>();
  private readonly digests = new Map<string, string>();
  private readonly components: Set<string>;
  private readonly units = new Map<string, BoundaryUnit>();
  private readonly operations = new Map<string, BoundaryOperation>();
  private readonly accesses = new Map<string, BoundaryAccess>();
  private readonly rules = new Map<string, BoundaryRule>();
  private readonly linkedUses = new Set<string>();
  private readonly sourceUses = new Map<string, BaselineSourceUse>();
  private readonly callerUses = new Set<string>();
  private readonly physicalSites = new Map<string, string>();
  private readonly interfaces;
  private readonly entries;
  private readonly statements;
  private readonly checks;

  private readonly baseline: BaselineV6;
  private readonly issue: Issue;

  constructor(baseline: BaselineV6, issue: Issue) {
    this.baseline = baseline;
    this.issue = issue;
    this.review = baseline.boundaryReview;
    this.components = new Set(baseline.components.map(component => component.id));
    this.interfaces = new Map(baseline.interfaces.map(item => [item.id, item]));
    this.entries = new Map(baseline.systemEntryPoints?.entries.map(entry => [entry.id, entry]));
    this.statements = new Map(baselineStatements(baseline).map(item => [item.itemId + "." + item.field, item.statement]));
    this.checks = new BoundaryChecks(this.review, this.units, this.accesses, this.rules, issue);
  }

  private addNote(ref: string, loc: BaselineSourceLocation, path: Path, local: boolean): void {
    const other = this.notes.get(ref);
    if (other && (local || siteKey(loc) !== siteKey(other))) {
      this.issue([...path, "evidenceRef"], "A source reference must identify a single saved note. Reuse an existing reference.");
    }
    if (loc.snapshotRef !== this.review.identity.snapshotRef) {
      this.issue([...path, "location", "snapshotRef"], "The source location must belong to this snapshot.");
    }
    const digest = loc.sha256.toLowerCase();
    if (this.digests.has(loc.path) && this.digests.get(loc.path) !== digest) {
      this.issue([...path, "location", "sha256"], "Locations in the same snapshot file must have the same digest.");
    }
    this.notes.set(ref, loc);
    this.digests.set(loc.path, digest);
  }

  private collectNotes(): void {
    const { sourceUsage, systemEntryPoints } = this.baseline;
    for (const source of [sourceUsage, systemEntryPoints]) {
      if (!source) continue;
      for (const field of ["mappingRef", "snapshotRef"] as const) {
        if (source[field] !== this.review.identity[field]) this.issue(["identity", field], "The boundary review must use the selected snapshot and mapping.");
      }
    }
    // Locations already cited by the baseline remain available without copying their notes.
    for (const iface of this.baseline.interfaces) for (const note of iface.documentation?.sourceNotes ?? []) {
      if (note.location) this.addNote(note.evidenceRef, note.location, ["identity"], false);
    }
    for (const assessment of sourceUsage?.assessments ?? []) {
      for (const note of assessment.sourceNotes) if (note.location) this.addNote(note.evidenceRef, note.location, ["identity"], false);
      for (const use of assessment.uses) {
        this.sourceUses.set(key(assessment.interfaceId, use.id), use);
        this.callerUses.add(key(assessment.interfaceId, use.callerRef, use.kind));
      }
    }
    for (const entry of systemEntryPoints?.entries ?? []) {
      if (entry.source) this.addNote(entry.source.evidenceRef, entry.source.location, ["identity"], false);
    }
    this.review.sourceNotes.forEach((note, index) => this.addNote(note.evidenceRef, note.location, ["sourceNotes", index], true));
  }

  private evidence(refs: string[], path: Path): void {
    refs.forEach((ref, index) => {
      if (!this.notes.has(ref)) this.issue([...path, "evidenceRefs", index], "Cite an existing source note with its snapshot location.");
    });
  }

  private records<T extends { evidenceRefs: string[] }>(name: string, records: T[], identifier: (value: T) => string,
    visit: (value: T, path: Path) => void): void {
    const seen = new Set<string>();
    records.forEach((item, index) => {
      const path = [name, index];
      const id = identifier(item);
      if (seen.has(id)) this.issue(path, "Each reviewed record must have a distinct identity in its collection.");
      seen.add(id);
      visit(item, path);
      this.evidence(item.evidenceRefs, path);
    });
  }

  private component(item: BoundaryComponentScope, path: Path): void {
    if (!this.components.has(item.componentId)) this.issue([...path, "componentId"], "Expected a component of this baseline.");
    if (item.roles.length === 1 && item.roles[0] === "test" && !["declaration", "complete-review"].includes(item.basis)) {
      this.issue([...path, "basis"], "A test-only component requires a declaration or a complete review.");
    }
    if ((item.basis === "unknown" || item.roles.includes("unknown")) && !item.reason) {
      this.issue([...path, "reason"], "Explain the uncertainty in the component's role.");
    }
    if (item.basis === "unknown" && !item.roles.includes("unknown")) {
      this.issue([...path, "roles"], "An unclassified component needs the unknown role.");
    }
  }

  private unit(item: BoundaryUnit, path: Path): void {
    this.units.set(item.id, item);
    if (item.ownerId !== null && !this.components.has(item.ownerId)) this.issue([...path, "ownerId"], "Expected a known owner or an explicitly unknown owner.");
    if ((item.ownerId === null || item.roles.includes("unknown")) && !item.reason) this.issue([...path, "reason"], "Explain the unknown ownership or scope.");
    if ((item.symbol !== undefined) !== (item.unitKind === "symbol")) this.issue([...path, "symbol"], "Only a symbol unit names a selected symbol.");
    if (item.generatedFromRef !== undefined && !this.notes.has(item.generatedFromRef)) this.issue([...path, "generatedFromRef"], "Cite the known source origin.");
    if (!item.evidenceRefs.some(ref => this.notes.get(ref)?.path === item.path)) {
      this.issue([...path, "evidenceRefs"], "Cite the file or symbol being assigned.");
    }
  }

  private operation(item: BoundaryOperation, path: Path): void {
    this.operations.set(item.id, item);
    const unit = this.units.get(item.unitId);
    if (!unit) this.issue([...path, "unitId"], "Expected the reviewed unit that declares this member.");
    if (item.roles.includes("unknown") && !item.reason) this.issue([...path, "reason"], "Explain the operation's unknown scope.");
    const iface = item.interfaceId === undefined ? undefined : this.interfaces.get(item.interfaceId);
    if (item.interfaceId !== undefined && (!iface ||
        (this.review.status === "current" && iface.owner.value !== unit?.ownerId))) {
      this.issue([...path, "interfaceId"], "The linked interface must have the operation's direct owner.");
    }
    if (item.entryId !== undefined && !iface?.documentation?.entries.some(entry => entry.id === item.entryId)) {
      this.issue([...path, "entryId"], "The entry must belong to the linked interface.");
    }
    item.systemEntryIds?.forEach((id, index) => {
      const entry = this.entries.get(id);
      if (!entry || entry.componentId !== unit?.ownerId || (entry.interfaceId !== undefined && entry.interfaceId !== item.interfaceId) ||
          (entry.entryId !== undefined && entry.entryId !== item.entryId)) {
        this.issue([...path, "systemEntryIds", index], "The startup or registration evidence must belong to this operation.");
      }
    });
  }

  private link(access: BoundaryAccess, op: BoundaryOperation | undefined, caller: BoundaryUnit | undefined, path: Path): void {
    const kind = access.kind === "type" ? "type" : "value";
    if (!access.sourceUse) {
      if (op?.interfaceId && this.callerUses.has(key(op.interfaceId, access.callerRef, kind))) {
        this.issue([...path, "sourceUse"], "Link the existing interface use at this caller site.");
      }
      return;
    }
    const { interfaceId, useId } = access.sourceUse;
    const signature = key(interfaceId, useId);
    const use = this.sourceUses.get(signature);
    const context = access.callerRole === "test" ? "test" : access.callerRole === "production" ? "application" :
      access.callerRole === "unknown" ? "unknown" : "tooling";
    if (this.linkedUses.has(signature)) this.issue(path, "This source use is already stored by another crossing.");
    this.linkedUses.add(signature);
    if (!use || !op || interfaceId !== op.interfaceId || use.consumerId !== caller?.ownerId || use.kind !== kind ||
        use.context !== context || use.callerRef !== access.callerRef || (use.entryId !== undefined && use.entryId !== op.entryId) ||
        !use.evidenceRefs.every(ref => access.evidenceRefs.includes(ref))) {
      this.issue([...path, "sourceUse"], "The linked source use must share the caller, interface member, access kind, role and evidence.");
    }
  }

  private recordSite(access: BoundaryAccess, reference: string, path: Path): void {
    const location = this.notes.get(reference);
    if (!location) return;
    const site = key(siteKey(location), access.callerUnitId, access.kind, access.context, access.targetUnitId, access.member,
      access.writtenPath, access.callerRole, access.targetRole);
    if (this.physicalSites.has(site)) this.issue(path, "The same observed access site appears more than once.");
    this.physicalSites.set(site, access.id);
  }

  private access(item: BoundaryAccess, path: Path): void {
    this.accesses.set(item.id, item);
    const caller = this.units.get(item.callerUnitId);
    if (!caller) this.issue([...path, "callerUnitId"], "Expected the unit containing the caller site.");
    const location = this.notes.get(item.callerRef);
    if (!location || !item.evidenceRefs.includes(item.callerRef) || location.path !== caller?.path) {
      this.issue([...path, "callerRef"], "The caller must cite a located source note in its own unit and include it in evidence.");
    }
    if (item.targetUnitId === null) {
      if (!item.reason || item.operationId !== undefined || item.member !== null || item.targetRole !== "unknown") {
        this.issue([...path, "targetUnitId"], "An unresolved target needs a reason, unknown target role and no bound member.");
      }
    } else if (!this.units.has(item.targetUnitId)) this.issue([...path, "targetUnitId"], "Expected the resolved target unit.");
    const operation = item.operationId === undefined ? undefined : this.operations.get(item.operationId);
    if (item.operationId !== undefined) {
      if (!operation || operation.unitId !== item.targetUnitId) this.issue([...path, "operationId"], "The named member must belong to the resolved target unit.");
      if (operation?.member !== item.member) this.issue([...path, "member"], "The member must match the bound operation.");
    }
    this.link(item, operation, caller, path);
    this.recordSite(item, item.callerRef, path);
    item.emittedCopies?.forEach((copy, i) => {
      const emitted = this.notes.get(copy.emittedRef);
      if (copy.sourceRef !== item.callerRef || !emitted || !this.notes.has(copy.proofRef) || !location ||
          siteKey(emitted) === siteKey(location) || new Set([copy.sourceRef, copy.emittedRef, copy.proofRef]).size !== 3) {
        this.issue([...path, "emittedCopies", i], "A copy must cite the exact source, a distinct emitted location and proof of that pair.");
      }
      this.recordSite(item, copy.emittedRef, [...path, "emittedCopies", i]);
    });
  }

  private rule(item: BoundaryRule, path: Path): void {
    if (item.authority === "accepted") {
      if (!item.acceptanceRef || !item.statementRef || !item.referenceDigest || item.referenceDigest !== this.review.identity.referenceDigest) {
        this.issue([...path, "acceptanceRef"], "Inherited policy must identify the acceptance, statement and exact selected reference file.");
      }
    } else if (item.acceptanceRef !== undefined || item.referenceDigest !== undefined) {
      this.issue([...path, "authority"], "Only accepted policy cites a prior acceptance.");
    }
    if (item.kind === "exception" && (!item.overridesRuleId || !this.rules.has(item.overridesRuleId) || item.overridesRuleId === item.id)) {
      this.issue([...path, "overridesRuleId"], "An exception must identify the rule it overrides.");
    }
    if (item.kind !== "exception" && item.overridesRuleId !== undefined) this.issue([...path, "overridesRuleId"], "Only an exception overrides a rule.");
  }

  validate(): void {
    const review = this.review;
    this.collectNotes();
    this.records("componentScopes", review.componentScopes, item => item.componentId, (item, path) => this.component(item, path));
    const unitKeys = new Set<string>();
    this.records("units", review.units, item => item.id, (item, path) => {
      if (unitKeys.has(unitKey(item))) this.issue(path, "A mapped code unit appears more than once.");
      unitKeys.add(unitKey(item));
      this.unit(item, path);
    });
    this.records("operations", review.operations, item => item.id, (item, path) => this.operation(item, path));
    this.records("accesses", review.accesses, item => item.id, (item, path) => this.access(item, path));
    for (const rule of review.rules) this.rules.set(rule.id, rule);
    this.records("rules", review.rules, item => item.id, (item, path) => this.rule(item, path));
    this.records("checks", review.checks, item => item.id, (item, path) => this.checks.validate(item, path));
    this.records("callerSearches", review.callerSearches, item => key(item.operationId, item.role), (item, path) => {
      if (!this.operations.has(item.operationId)) this.issue([...path, "operationId"], "Expected a reviewed operation.");
      this.checks.coverage(item.coverage, [...path, "coverage"]);
    });
    const destinations = new Set<string>();
    this.records("matches", review.matches, item => key(item.referenceDigest, item.oldPath, item.oldSymbol, item.oldMember), (item, path) => {
      if (item.referenceDigest !== review.identity.referenceDigest) this.issue([...path, "referenceDigest"], "Match against the exact selected reference file.");
      if (!this.units.has(item.unitId) || (item.operationId && this.operations.get(item.operationId)?.unitId !== item.unitId)) {
        this.issue([...path, "unitId"], "A move must identify its current unit and member.");
      }
      const target = key(item.unitId, item.operationId);
      if (destinations.has(target)) this.issue(path, "A confirmed move must have exactly one source and destination.");
      destinations.add(target);
    });
    review.statementRefs?.forEach((ref, index) => {
      if (!this.statements.has(ref)) this.issue(["statementRefs", index], "The cited input must name a statement of this baseline.");
    });
  }
}

export function validateBoundaryReview(baseline: Baseline, context: z.RefinementCtx): void {
  if (baseline.formatVersion !== 6) return;
  const issue: Issue = (path, message) => context.addIssue({ code: "custom", path: ["boundaryReview", ...path], message });
  if (utf8Length(JSON.stringify(baseline.boundaryReview)) > 2 * 1024 * 1024) {
    issue([], "The boundary-review limit is 2097152 UTF-8 bytes.");
    return;
  }
  new ReviewReferences(baseline, issue).validate();
}
