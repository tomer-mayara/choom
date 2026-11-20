import type { BaselineV6, IsolationComparison, IsolationFinding, IsolationInput } from "./generated/contracts.ts";
import { CheckedCrossings, compareCrossings, scopeChange, unmatchedCrossings } from "./isolation-crossings.ts";
import { evidence, IsolationFacts, samePolicy, type Access } from "./isolation-facts.ts";
import { matchedKeys } from "./isolation-identities.ts";
import { ComparisonResult } from "./isolation-result.ts";
import { IsolationInventory } from "./isolation-inventory.ts";
import { baselineStatements } from "./item-statements.ts";
import { sameJsonData } from "./json-data.ts";
import type { ReadonlyData } from "./readonly-data.ts";

type File = ReadonlyData<BaselineV6>;
const boundaryFields = new Set(["allowedConsumers", "owner", "membership", "parent", "publicAccess", "subject", "expected", "check", "accessRules"]);

function decisionChanges(before: File, after: File): IsolationFinding[] {
  const previous = new Map(baselineStatements(before).map(s => [s.itemId + "." + s.field, s]));
  const explicit = new Set([...(before.boundaryReview.statementRefs ?? []), ...(after.boundaryReview.statementRefs ?? [])]);
  const findings: IsolationFinding[] = [];
  for (const item of baselineStatements(after)) {
    const ref = item.itemId + "." + item.field, old = previous.get(ref);
    if (!old || (!explicit.has(ref) && !boundaryFields.has(item.field))) continue;
    if (item.statement.status === old.statement.status && item.statement.acceptanceRef === old.statement.acceptanceRef &&
      sameJsonData(item.statement.value, old.statement.value)) continue;
    const record = { ...evidence(null, null, null), statementRef: ref };
    findings.push({ change: "Policy or ownership changed", reason: "A recorded boundary statement changed.", before: record, after: record });
  }
  return findings;
}

function metadataChanges(before: IsolationFacts, after: IsolationFacts, checked: readonly IsolationFinding[]): IsolationFinding[] {
  const findings: IsolationFinding[] = [];
  const reported = checked.filter(f => f.change === "Policy or ownership changed");
  const rules = new Set(reported.flatMap(f => f.after?.ruleId ?? []));
  const units = new Set(reported.filter(f => f.reason.startsWith("The direct owner changed"))
    .flatMap(f => [f.after?.callerUnitId, f.after?.targetUnitId]));
  const oldRules = new Map([...before.rules.values()].map(rule => [before.identities.rules.get(rule.id), rule]));
  for (const rule of after.rules.values()) {
    const old = oldRules.get(after.identities.rules.get(rule.id));
    if (old) oldRules.delete(after.identities.rules.get(rule.id));
    if (rules.has(rule.id) || old && samePolicy(old, rule) &&
      before.identities.rules.get(old.overridesRuleId ?? "") === after.identities.rules.get(rule.overridesRuleId ?? "")) continue;
    findings.push({ change: "Policy or ownership changed", reason: rule.kind === "exception" ? "The recorded exception changed." : "The recorded rule changed.",
      before: old ? evidence(null, null, old.id) : null, after: evidence(null, null, rule.id) });
  }
  for (const old of oldRules.values()) findings.push({ change: "Policy or ownership changed", reason: "Before alone records this rule.",
    before: evidence(null, null, old.id), after: null });
  const oldUnits = new Map([...before.units.values()].map(unit => [before.identities.units.get(unit.id), unit]));
  for (const unit of after.units.values()) {
    const old = oldUnits.get(after.identities.units.get(unit.id));
    if (!old || units.has(unit.id) || before.owner(old.id) === after.owner(unit.id)) continue;
    findings.push({ change: "Policy or ownership changed", reason: "The direct owner changed. A source change is unverified.",
      before: evidence(old.id, old.id, null), after: evidence(unit.id, unit.id, null) });
  }
  return findings;
}

function uncheckedAccess(before: IsolationFacts, after: IsolationFacts, l: readonly Access[], r: readonly Access[]): IsolationFinding | undefined {
  if (l.some(site => before.assessed.has(site.id)) || r.some(site => after.assessed.has(site.id))) return;
  const side = r.length ? after : before, site = r[0] ?? l[0];
  if (!site) return;
  const owner = side.owner(site.callerUnitId), target = site.targetUnitId && side.owner(site.targetUnitId);
  if (owner && owner === target) return;
  const transition = scopeChange(l, r);
  const change = transition ?? (owner && target ? "Needs review" : "Comparison limited");
  const reason = transition ? "The role of an observed access changed." : owner && target ?
    "No applicable permission was established for this access." : "The endpoint binding is unresolved.";
  return { change, reason, before: before.observedEvidence(l), after: after.observedEvidence(r) };
}

function compareFacts(before: IsolationFacts, after: IsolationFacts, stale: boolean, result: ComparisonResult): void {
  const oldInventory = new IsolationInventory(before, after), newInventory = new IsolationInventory(after, before);
  for (const id of [...new Set([...before.checks.keys(), ...after.checks.keys()])].sort()) {
    const left = CheckedCrossings.from(before, before.checks.get(id)), right = CheckedCrossings.from(after, after.checks.get(id));
    if (left && right && !result.add(compareCrossings(left, right))) return;
    if (left && !right && !result.add(unmatchedCrossings(left, false, newInventory))) return;
    if (right && !left && !result.add(unmatchedCrossings(right, true, oldInventory))) return;
  }
  if (stale) {
    if (!result.findings.some(f => f.change === "Comparison limited")) result.add([{ change: "Comparison limited",
      reason: "The boundary review needs refresh.", before: null, after: null }]);
    return;
  }
  if (!result.add(metadataChanges(before, after, result.findings))) return;
  for (const id of [...new Set([...before.observed.keys(), ...after.observed.keys()])].sort()) {
    const finding = uncheckedAccess(before, after, before.observed.get(id) ?? [], after.observed.get(id) ?? []);
    if (finding && !result.add([finding])) return;
  }
}

const priority: IsolationFinding["change"][] = ["New violation", "Comparison limited", "Existing violation",
  "Resolved violation", "Policy or ownership changed", "Entered production scope", "Left production scope", "Interface use changed", "Needs review"];

/** Compare validated saved facts in the selected direction before applying a display scope. */
export function compareIsolation(before: ReadonlyData<IsolationInput>, after: ReadonlyData<IsolationInput>): IsolationComparison {
  if (before.baseline.formatVersion !== 6 || after.baseline.formatVersion !== 6)
    return { status: "incompatible-format", complete: false, findings: [] };
  const left = before.baseline.boundaryReview, right = after.baseline.boundaryReview;
  if (left.identity.projectKey !== right.identity.projectKey) return { status: "project-mismatch", complete: false, findings: [] };
  if (before.sha256 === after.sha256) return { status: "identical", complete: true, findings: [] };
  const [beforeKeys, afterKeys] = matchedKeys(left, right, before.sha256, after.sha256);
  const a = new IsolationFacts(left, beforeKeys), b = new IsolationFacts(right, afterKeys);
  const result = new ComparisonResult(before.baseline, after.baseline);
  if (result.add(decisionChanges(before.baseline, after.baseline))) compareFacts(a, b, left.status !== "current" || right.status !== "current", result);
  const { findings } = result;
  const complete = a.fullyChecked() && b.fullyChecked() && !findings.some(f => f.change === "Comparison limited" || f.change === "Needs review");
  const ordered = findings.map(finding => ({ finding, order: priority.indexOf(finding.change), key: JSON.stringify(finding) }))
    .sort((x, y) => x.order - y.order || x.key.localeCompare(y.key, "en"));
  return { status: "compared", complete, findings: ordered.map(item => item.finding) };
}
