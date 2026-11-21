import { createHash } from "node:crypto";
import type { RecordInputs } from "../../src/stage-6-records.ts";
import { loadTsMorph } from "../../src/ts-morph-modules.ts";

// In-memory records for the shared record validator of Stages 4, 5 and 6
// (stage-6-records.ts), modeled on the Stage 6 producer fixture. Each call of
// recordInputs makes new records, and `change` edits them before the caller
// validates them.
export interface Statement<T> { value: T; status: string; evidenceRefs: string[]; acceptanceRef?: string }
export interface Component {
  id: string;
  name: string;
  purpose: Statement<string | null>;
  membership: Statement<{ paths: string[] }>;
  groupingReason: Statement<string | null>;
  parent?: Statement<string>;
}
interface Issue { id: string; kind: string; reason: string; subjectRefs: string[]; evidenceRefs: string[] }
interface InspectedPath {
  id: string;
  description: string;
  entryPointRef: string;
  componentIds: string[];
  evidenceRefs: string[];
  limits?: string[];
  steps?: { action: string; evidenceRefs: string[] }[];
}
export interface MappingUnit {
  id: string;
  path: string;
  sha256: string;
  roles: string[];
  reason: string;
  inspection: string;
  owner: string | null;
  membershipRef: string | null;
  evidenceRefs: string[];
}
interface SourceNote { evidenceRef: string; description: string; location?: object }
interface Example { id: string; name: string; basis: string; content: Statement<{ text: string }> }
interface DocumentationEntry {
  id: string;
  name: string;
  accessPoint: string;
  kind: Statement<string>;
  description: Statement<string | null>;
  examples: Example[];
}
export interface Documentation { summary: Statement<string>; entries: DocumentationEntry[]; sourceNotes: SourceNote[] }
export interface SourceUse {
  id: string;
  consumerId: string | null;
  kind: string;
  context: string;
  description: string;
  callerRef: string;
  evidenceRefs: string[];
}
export interface SourceAssessment {
  interfaceId: string;
  scope: string;
  evidenceRefs: string[];
  limitations: string[];
  uses: SourceUse[];
  sourceNotes: SourceNote[];
}
interface SourceUsage { snapshotRef: string; mappingRef: string; assessments: SourceAssessment[] }
export interface Records {
  baseline: { formatVersion: number; id: string; parentId: string | null; components: Component[]; interfaces: unknown[];
    resources: []; rules: unknown[]; sourceUsage?: SourceUsage };
  discovery: { gaps: Issue[]; inspectedPaths: InspectedPath[]; baselineRef?: string } & Record<string, unknown>;
  entry: { gaps: Issue[]; behaviorEntries: unknown[] } & Record<string, unknown>;
  mapping: { scope: { unitKind: string } & Record<string, unknown>; units: MappingUnit[] } & Record<string, unknown>;
  candidates: { candidates: Record<string, unknown>[] } & Record<string, unknown>;
  resourceCandidates: { candidates: Record<string, unknown>[] } & Record<string, unknown>;
}
interface Artifact { path: string; bytes: Buffer; sha256: string }

export const digest = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
export const snapshotRef = "snap";
export const runRef = "run-1";
export const stage = "s5-x";
export const proposal = `${stage}-file@baseline.proposed.yaml`;
export const selected = { entryAnalysisRef: `${stage}-entry-analysis`, codeMappingRef: `${stage}-file@code-mapping.json`,
  dependenciesRef: "graph", resourceAccessRef: `${stage}-file@resource-access.json` };
export const evidenceRefs = ["launch"];
export const statement = <T>(value: T): Statement<T> => ({ value, status: "proposed", evidenceRefs });
export const files: Record<string, string> = { "cli.ts": "export function start() {}\n", "http.ts": "export function orders() {}\n" };
const inventory = { formatVersion: 1, snapshotId: snapshotRef, files: Object.entries(files)
  .map(([path, source]) => ({ path, kind: "file", bytes: Buffer.byteLength(source), sha256: digest(source) })) };
export const location = { snapshotRef, path: "http.ts", sha256: digest(files["http.ts"] ?? ""), lines: [1, 1] };
const graphInput = { id: "default", roots: [{ path: "cli.ts", evidenceRefs }], compilerSettingsRef: null,
  conditionNames: [], moduleSystems: [] };
// The behavior entry candidates that Stage 4 collect saved, and the rule list that they name.
export const candidatesRef = "s4-x-file@behavior-entry-candidates.json";
const rules = { formatVersion: 1, rules: [{ id: "express-route-get", version: 1, entryKind: "http-route" }] };
// The resource access candidates that Stage 4 collect saved, and the rule list and the source sites that they name.
const resourceCandidatesRef = "s4-x-file@resource-access-candidates.json";
const resourceRule = { library: "knex", resourceKind: "database-table", operation: "write" };
const resourceRules = { formatVersion: 1, rules: [{ id: "knex-insert", version: 1, ...resourceRule }] };

function initialRecords(): Records {
  const gaps = [{ id: "gap-1", kind: "entry", reason: "Unknown.", subjectRefs: ["plugin-candidate"], evidenceRefs: ["launch#/unresolved"] }];
  const components: Component[] = ["cli", "http"].map((id) => ({ id, name: id, purpose: statement(id.toUpperCase()),
    membership: statement({ paths: [`${id}.ts`] }), groupingReason: statement("One file.") }));
  return {
    baseline: { formatVersion: 1, id: "base-1", parentId: null, components, interfaces: [], resources: [], rules: [] },
    discovery: { formatVersion: 1, kind: "architecture-discovery", runRef, ...selected,
      overview: { text: "Overview.", evidenceRefs }, inspectedPaths: [], questions: [], gaps: structuredClone(gaps) },
    entry: { formatVersion: 1, kind: "entry-analysis", snapshotRef, planRef: "knip-plan", knipRunsRef: "knip-runs",
      llmReview: "recorded", reviewedFiles: [{ id: "orders-handler", ...location }], gaps, questions: [],
      knipAssessment: { action: "reuse", reason: "Reuse.", evidenceRefs },
      // The gap names plugin-candidate, as in the Stage 6 producer fixture.
      candidates: [{ id: "cli-candidate", expression: "serve", path: "cli.ts", workspace: ".", roles: ["application"],
        origin: "script", evidenceRefs }, { id: "plugin-candidate", expression: "plugin", path: null, workspace: ".",
        roles: ["application"], origin: "unknown", evidenceRefs: ["launch#/unresolved"] }],
      inspectionPriorities: [],
      behaviorEntries: [{ id: "http-route", kind: "route", expression: "GET /orders", componentRef: "http",
        source: { path: "http.ts", lines: [1, 1] }, fileEntryRefs: ["cli-candidate"], evidenceRefs: ["orders-handler"] }],
      reachability: { status: "assessed-with-limits", method: "context-specific-source-graph-traversal", dependenciesRef: "graph",
        reason: "One root.", contexts: [{ id: "default", resultRef: "graph#/contexts/0/reachability" }] } },
    mapping: { formatVersion: 1, kind: "code-mapping", snapshotRef, limits: ["l"],
      scope: { historicalEntryAnalysisRefs: [], inventoryRef: "inventory", basis: "all-inventoried-regular-files",
        unitKind: "file", inspectionMeaning: "Saved ranges.", selectedEntryAnalysisRef: selected.entryAnalysisRef },
      units: inventory.files.map((file, index) => ({ id: `unit-${index}`, path: file.path, sha256: file.sha256,
        roles: ["source"], reason: "r", inspection: file.path === "http.ts" ? "reviewed" : "unreviewed",
        owner: components[index]?.id ?? null, membershipRef: `${proposal}#/components/${index}/membership`, evidenceRefs })) },
    candidates: { formatVersion: 1, snapshotRef, status: "completed", rulesRef: "s4-x-file@behavior-entry-rules.yaml",
      rulesSha256: digest(JSON.stringify(rules)), omittedCandidates: 0, notes: ["A candidate is not a proven entry."], gaps: [],
      candidates: [{ ruleId: "express-route-get", ruleVersion: 1, entryKind: "http-route", found: "syntax-rule", role: "unknown",
        roleRef: null, path: "http.ts", sha256: digest(files["http.ts"] ?? ""), range: [{ line: 1, column: 1 }, { line: 1, column: 28 }],
        expression: "export function orders() {}", truncated: false, name: null, nameReason: "No literal name.",
        handler: null, handlerReason: "No handler." }] },
    resourceCandidates: { formatVersion: 1, snapshotRef, status: "completed", rulesRef: "s4-x-file@resource-access-rules.yaml",
      rulesSha256: digest(JSON.stringify(resourceRules)), sourceSitesRef: "s4-x-file@source-sites.json", omittedCandidates: 0,
      notes: ["A candidate is not proven resource access."], gaps: [], candidates: [{ ruleId: "knex-insert", ruleVersion: 1,
        ...resourceRule, confidence: "receiver-import", siteRef: null, path: "http.ts", sha256: location.sha256, range: [{ line: 1, column: 1 },
          { line: 1, column: 28 }], expression: "export function orders() {}", truncated: false, name: "orders", nameReason: null,
        identity: "inferred-from-name", context: { kind: "module", name: null, range: null, graphContext: "default-import" } }] },
  };
}

// JSON text is also valid YAML, so the caller can parse every saved record with JSON.parse.
export function recordInputs(change: (records: Records) => void = () => {}): RecordInputs {
  const records = initialRecords();
  change(records);
  const saved: Record<string, [string, unknown]> = {
    inventory: ["evidence/inventory.json", inventory],
    launch: ["evidence/launch.json", { cli: "serve", unresolved: "plugin" }],
    excerpts: ["evidence/s5-x/source-excerpts.json", { excerpts: [
      { id: "orders-handler", ...location, text: (files["http.ts"] ?? "").trimEnd() },
      { id: "unread-cli", snapshotRef, path: "cli.ts", sha256: inventory.files[0]?.sha256, lines: [1, 1],
        text: (files["cli.ts"] ?? "").trimEnd() }] }],
    "knip-plan": ["evidence/knip-plan.json", { snapshotRef, workspaces: [{ dir: "." }] }],
    "knip-profile": ["evidence/knip-profile.json", {}],
    "knip-preflight": ["evidence/knip-preflight.json", { snapshotRef }],
    "graph-profile": ["evidence/graph-profile.json", { formatVersion: 1, snapshotRef,
      contexts: [{ ...graphInput, sourceFiles: ["cli.ts"] }] }],
    graph: ["evidence/graph-results.json", { formatVersion: 1, snapshotRef, status: "completed", coverage: "partial",
      limits: ["l"], profileRef: "graph-profile", contexts: [{ ...graphInput, status: "completed", coverage: "partial",
        limits: ["l"], scanFiles: ["cli.ts"], edges: [], reachability: { status: "completed-with-limits",
          method: "breadth-first traversal of retained internal source edges",
          edgePolicy: "includes type-only, re-export, and literal-dynamic source dependencies; not runtime execution",
          roots: ["cli.ts"], reached: ["cli.ts"], notReached: [], stoppedEdges: [] } }] }],
    [selected.entryAnalysisRef]: ["evidence/s5-x/entry-analysis.yaml", records.entry],
    [selected.codeMappingRef]: ["evidence/s5-x/code-mapping.json", records.mapping],
    [selected.resourceAccessRef]: ["evidence/s5-x/resource-access.json", { formatVersion: 1, kind: "resource-observations",
      snapshotRef, resourceAccessCandidatesRef: resourceCandidatesRef, scope: { historicalEntryAnalysisRefs: [],
        method: "source-inspection", reviewedFilesRef: `${selected.entryAnalysisRef}#/reviewedFiles` }, observations: [], limits: ["l"] }],
    [proposal]: ["evidence/s5-x/baseline.proposed.yaml", records.baseline],
    [candidatesRef]: ["evidence/s4-x/behavior-entry-candidates.json", records.candidates],
    "s4-x-file@behavior-entry-rules.yaml": ["evidence/s4-x/behavior-entry-rules.yaml", rules],
    [resourceCandidatesRef]: ["evidence/s4-x/resource-access-candidates.json", records.resourceCandidates],
    "s4-x-file@resource-access-rules.yaml": ["evidence/s4-x/resource-access-rules.yaml", resourceRules],
    "s4-x-file@source-sites.json": ["evidence/s4-x/source-sites.json", { formatVersion: 1, snapshotRef, sites: [] }],
  };
  const artifacts = new Map<string, Artifact>();
  const register = (ref: string, path: string, value: unknown): void => {
    const bytes = Buffer.from(JSON.stringify(value));
    artifacts.set(ref, { path, bytes, sha256: digest(bytes) });
  };
  for (const [ref, [path, value]] of Object.entries(saved)) register(ref, path, value);
  const sha = (ref: string): string | undefined => artifacts.get(ref)?.sha256;
  register("knip-runs", "evidence/knip-runs.json", { snapshotRef, profileRef: "knip-profile", preflightRef: "knip-preflight",
    runs: [], inputDigests: { planSha256: sha("knip-plan"), profileSha256: sha("knip-profile"),
      preflightSha256: sha("knip-preflight"), inventorySha256: sha("inventory") } });
  return { run: { formatVersion: 1, id: runRef, snapshot: { id: snapshotRef, inventoryRef: "inventory" } },
    baseline: records.baseline, discovery: records.discovery, inventory, artifacts, parse: (text) => JSON.parse(text) as unknown,
    readSource: (path) => Buffer.from(files[path] ?? ""),
    // The ts-morph of this checkout. A stage also checks it against the pins of its start.
    divisionTools: () => loadTsMorph().tools };
}
