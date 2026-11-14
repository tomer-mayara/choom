import type {
  Baseline, BaselineInterface, DuplicationBaselineBinding, DuplicationEndpointReference,
  DuplicationFinding, DuplicationReport, DuplicationSnapshotBinding,
} from "./generated/contracts.ts";
import type { ReadonlyData } from "./readonly-data.ts";
import { resolveDuplicationRecordedFact } from "./duplication-facts.ts";

export function duplicationFindingKey(
  baseline: ReadonlyData<DuplicationBaselineBinding>, snapshot: ReadonlyData<DuplicationSnapshotBinding>,
  finding: Pick<ReadonlyData<DuplicationFinding>, "kind" | "endpoints">,
): string {
  const endpoints = finding.endpoints.map((endpoint) => finding.kind === "interface-pair"
    ? [endpoint.interfaceId] : [endpoint.interfaceId, endpoint.entryId ?? null]);
  endpoints.sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);
  return JSON.stringify([baseline.sha256, snapshot.id, snapshot.inventorySha256, finding.kind, endpoints]);
}

export function matchesDuplicationBaseline(report: ReadonlyData<DuplicationReport>, baseline: ReadonlyData<Baseline>, sha256: string): boolean {
  return report.baseline.id === baseline.id && report.baseline.formatVersion === baseline.formatVersion
    && report.baseline.sha256 === sha256;
}

function duplicationInterface(baseline: ReadonlyData<Baseline>, id: string): ReadonlyData<BaselineInterface> | undefined {
  return baseline.interfaces.find((item) => item.id === id);
}

function endpointExists(endpoint: ReadonlyData<DuplicationEndpointReference>, baseline: ReadonlyData<Baseline>): boolean {
  const item = duplicationInterface(baseline, endpoint.interfaceId);
  return Boolean(item && (endpoint.entryId === undefined || (baseline.formatVersion !== 1
    && item.documentation?.entries.some((entry) => entry.id === endpoint.entryId))));
}

function validPair(finding: Pick<ReadonlyData<DuplicationFinding>, "kind" | "endpoints">): boolean {
  const [a, b] = finding.endpoints;
  if (!a || !b) return false;
  return finding.kind === "interface-pair" ? a.interfaceId !== b.interfaceId
    : a.interfaceId === b.interfaceId && a.entryId !== undefined && b.entryId !== undefined && a.entryId !== b.entryId;
}

function findingBindings(finding: ReadonlyData<DuplicationFinding>, report: ReadonlyData<DuplicationReport>, baseline: ReadonlyData<Baseline>): string[] {
  const issues: string[] = [];
  if (!validPair(finding)) issues.push("A finding must name two different interfaces or two distinct entries of one interface.");
  const endpoints = [...finding.endpoints, ...finding.observations.flatMap((observation) => observation.endpoints),
    ...finding.facts.map((fact) => fact.endpoint)];
  if (endpoints.some((endpoint) => !endpointExists(endpoint, baseline))) issues.push("A finding names an unknown interface or entry.");
  const key = duplicationFindingKey(report.baseline, report.snapshot, finding);
  for (const observation of finding.observations) {
    const observed = { kind: finding.kind, endpoints: observation.endpoints };
    if (!validPair(observed) || duplicationFindingKey(report.baseline, report.snapshot, observed) !== key) {
      issues.push("An observation must describe its finding's interface or entry pair.");
    }
  }
  const observedEndpoints = [...finding.endpoints, ...finding.observations.flatMap((observation) => observation.endpoints)];
  for (const fact of finding.facts) {
    if (!observedEndpoints.some((endpoint) => endpoint.interfaceId === fact.endpoint.interfaceId && endpoint.entryId === fact.endpoint.entryId)) {
      issues.push("A comparison fact must name one of the finding's recorded endpoints.");
    }
    if (fact.basis === "recorded-contract" && !resolveDuplicationRecordedFact(baseline, fact)) {
      issues.push("A recorded comparison fact must reference a saved statement on its endpoint.");
    }
  }
  return issues;
}

export function validateDuplicationBinding(report: ReadonlyData<DuplicationReport>, baseline: ReadonlyData<Baseline>, sha256: string): string[] {
  const issues: string[] = [];
  if (!matchesDuplicationBaseline(report, baseline, sha256)) issues.push("The report belongs to different baseline bytes or identity.");
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const finding of report.findings) {
    const key = duplicationFindingKey(report.baseline, report.snapshot, finding);
    if (ids.has(finding.id) || keys.has(key)) issues.push("Finding IDs and canonical pairs must be unique.");
    ids.add(finding.id);
    keys.add(key);
    issues.push(...findingBindings(finding, report, baseline));
  }
  return issues;
}
