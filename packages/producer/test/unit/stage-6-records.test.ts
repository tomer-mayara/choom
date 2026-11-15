import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

// Characterization of the shared record validator that Stages 4, 5 and 6 use.
// The records are small in-memory copies modeled on the Stage 6 producer fixture.
interface Statement<T> { value: T; status: string; evidenceRefs: string[]; acceptanceRef?: string }
interface Component {
  id: string;
  name: string;
  purpose: Statement<string | null>;
  membership: Statement<{ paths: string[] }>;
  groupingReason: Statement<string>;
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
interface MappingUnit {
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
interface Records {
  baseline: { formatVersion: number; id: string; parentId: null; components: Component[]; interfaces: []; resources: []; rules: [] };
  discovery: { gaps: Issue[]; inspectedPaths: InspectedPath[]; baselineRef?: string } & Record<string, unknown>;
  entry: { gaps: Issue[]; behaviorEntries: unknown[] } & Record<string, unknown>;
  mapping: { scope: { unitKind: string } & Record<string, unknown>; units: MappingUnit[] } & Record<string, unknown>;
}
interface Artifact { path: string; bytes: Buffer; sha256: string }
interface RecordInputs {
  run: { formatVersion: number; id: string; snapshot: { id: string; inventoryRef: string } };
  baseline: Records["baseline"];
  discovery: Records["discovery"];
  inventory: unknown;
  artifacts: Map<string, Artifact>;
  parse(text: string): unknown;
  readSource(path: string, limit: number): Buffer;
  reservedIds?: string[];
  packet?: Map<string, Buffer>;
  draftDigests?: Record<string, string>;
}
interface RecordCounts {
  mappedFiles: number;
  unknownOwners: number;
  components: number;
  behaviorEntries: number;
  gaps: number;
  questions: number;
  graphContexts: number;
  sourceRecordsVerified: number;
}
interface RecordsModule {
  validateRecords(inputs: RecordInputs): RecordCounts;
  validateDiscoveryRecords(inputs: RecordInputs): RecordCounts;
}

// The validator is JavaScript. This local type states only what these tests use.
const recordsModule = new URL("../../src/stage-6-records.mjs", import.meta.url);
const { validateDiscoveryRecords, validateRecords } = (await import(recordsModule.href)) as RecordsModule;

const digest = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const snapshotRef = "snap";
const runRef = "run-1";
const stage = "s5-x";
const proposal = `${stage}-file@baseline.proposed.yaml`;
const selected = { entryAnalysisRef: `${stage}-entry-analysis`, codeMappingRef: `${stage}-file@code-mapping.json`,
  dependenciesRef: "graph", resourceAccessRef: `${stage}-file@resource-access.json` };
const evidenceRefs = ["launch"];
const statement = <T>(value: T): Statement<T> => ({ value, status: "proposed", evidenceRefs });
const files: Record<string, string> = { "cli.ts": "export function start() {}\n", "http.ts": "export function orders() {}\n" };
const inventory = { formatVersion: 1, snapshotId: snapshotRef, files: Object.entries(files)
  .map(([path, source]) => ({ path, kind: "file", bytes: Buffer.byteLength(source), sha256: digest(source) })) };
const location = { snapshotRef, path: "http.ts", sha256: digest(files["http.ts"] ?? ""), lines: [1, 1] };
const graphInput = { id: "default", roots: [{ path: "cli.ts", evidenceRefs }], compilerSettingsRef: null,
  conditionNames: [], moduleSystems: [] };

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
      candidates: [{ id: "cli-candidate", expression: "serve", path: "cli.ts", workspace: ".", roles: ["application"],
        origin: "script", evidenceRefs }],
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
  };
}

// JSON text is also valid YAML, so the caller can parse every saved record with JSON.parse.
function recordInputs(change: (records: Records) => void = () => {}): RecordInputs {
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
      snapshotRef, scope: { historicalEntryAnalysisRefs: [], method: "source-inspection",
        reviewedFilesRef: `${selected.entryAnalysisRef}#/reviewedFiles` }, observations: [], limits: ["l"] }],
    [proposal]: ["evidence/s5-x/baseline.proposed.yaml", records.baseline],
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
    readSource: (path) => Buffer.from(files[path] ?? "") };
}

function findComponent(records: Records, id: string): Component {
  const component = records.baseline.components.find((item) => item.id === id);
  if (!component) throw new Error(`Missing fixture component: ${id}`);
  return component;
}

function nameUnknownSubject(records: Records, subject: string): void {
  for (const gaps of [records.discovery.gaps, records.entry.gaps]) gaps.forEach((gap) => { gap.subjectRefs = [subject]; });
}

function unownedFirstFile(reason: string) {
  return (records: Records): void => {
    findComponent(records, "cli").membership.value.paths = ["missing-dir/**"];
    Object.assign(records.mapping.units[0] ?? {}, { owner: null, membershipRef: null, reason });
  };
}

const refusedCases: [string, (records: Records) => void, string][] = [
  ["an accepted statement", (records) => {
    Object.assign(findComponent(records, "cli").purpose, { status: "accepted", acceptanceRef: "acc-1" });
  }, "Only proposed intent is supported: cli.purpose"],
  ["a cycle of component parents", (records) => {
    findComponent(records, "cli").parent = statement("http");
    findComponent(records, "http").parent = statement("cli");
  }, "Component parent cycle: cli"],
  ["a file with two direct owners", (records) => {
    findComponent(records, "http").membership.value.paths.push("cli.ts");
  }, "Mapping and direct membership differ: cli.ts"],
  ["an unknown owner with a blank reason", unownedFirstFile(" "), "Invalid mapped unit or inspection coverage: cli.ts"],
  ["an inspected path without steps or limits", (records) => {
    records.discovery.inspectedPaths = [{ id: "path-1", description: "Route path.", entryPointRef: "http-route",
      componentIds: ["http"], evidenceRefs: ["orders-handler"] }];
  }, "Invalid inspected path: path-1"],
  ["a discovery that already names its baseline", (records) => {
    records.discovery.baselineRef = "base-1";
  }, "Expected complete working discovery with no fixed baseline reference."],
  ["no components", (records) => {
    records.baseline.components = [];
    records.mapping.units.forEach((unit) => Object.assign(unit, { owner: null, membershipRef: null }));
    records.entry.behaviorEntries = [];
  }, "Missing or duplicate components."],
  ["code units smaller than a file", (records) => {
    records.mapping.scope.unitKind = "symbol";
  }, "Invalid selected code mapping scope."],
  ["a glob membership selector", (records) => {
    findComponent(records, "cli").membership.value.paths = ["*.ts"];
  }, "Unsupported membership selectors: cli"],
  ["a null purpose with no question or gap", (records) => {
    findComponent(records, "cli").purpose.value = null;
  }, "Unexplained unknown intent: cli.purpose"],
  ["a null purpose that a gap names", (records) => {
    findComponent(records, "cli").purpose.value = null;
    nameUnknownSubject(records, "cli.purpose");
  }, "Missing component intent: cli"],
];

describe("validateDiscoveryRecords", () => {
  test("accepts the reviewed records and counts what they contain", () => {
    expect(validateDiscoveryRecords(recordInputs())).toMatchObject({ mappedFiles: 2, unknownOwners: 0, components: 2,
      behaviorEntries: 1, gaps: 1, questions: 0, graphContexts: 1, sourceRecordsVerified: 1 });
  });

  test("accepts a file with an unknown owner and a reason", () => {
    expect(validateDiscoveryRecords(recordInputs(unownedFirstFile("Owner unknown.")))).toMatchObject({ unknownOwners: 1 });
  });

  // P1: later tickets refuse references that name nothing. Today they pass.
  test("accepts question and gap subjects that name nothing", () => {
    expect(validateDiscoveryRecords(recordInputs((records) => nameUnknownSubject(records, "no-such-thing"))))
      .toMatchObject({ gaps: 1 });
  });

  // P2: only the entry site must be in a reviewed range. Today a step can cite an unread excerpt.
  test("accepts an inspected path step that cites a collected but unreviewed excerpt", () => {
    const inputs = recordInputs((records) => {
      records.discovery.inspectedPaths = [{ id: "path-1", description: "Route path.", entryPointRef: "http-route",
        componentIds: ["http"], evidenceRefs: ["unread-cli"], limits: ["l"],
        steps: [{ action: "Calls start.", evidenceRefs: ["unread-cli"] }] }];
    });
    expect(validateDiscoveryRecords(inputs)).toMatchObject({ mappedFiles: 2 });
  });

  test.each(refusedCases)("refuses %s", (_name, change, message) => {
    expect(() => validateDiscoveryRecords(recordInputs(change))).toThrow(message);
  });

  // Defect 1: the Stage 4/5 publisher does not reserve the baseline ID, so this passes there.
  // Stage 6 reserves it and refuses the same records after Stage 5 can no longer change.
  test("accepts a component ID equal to the baseline ID with the publisher's reserved IDs only", () => {
    const change = (records: Records): void => { records.baseline.id = "cli"; };
    expect(validateDiscoveryRecords({ ...recordInputs(change), reservedIds: [`${stage}-file@publication.json`] }))
      .toMatchObject({ components: 2 });
    expect(() => validateDiscoveryRecords({ ...recordInputs(change), reservedIds: ["cli", "s6-x-discovery"] }))
      .toThrow("Invalid or colliding model ID: cli");
  });
});

describe("validateRecords with a Stage 6 readiness packet", () => {
  const draftDigests = { "run.yaml": digest("run"), "baseline.yaml": digest("baseline"), "discovery.yaml": digest("discovery") };
  const identity = { formatVersion: 1, runRef, snapshotRef, baselineId: "base-1" };
  const readiness = { ...identity, status: "ready-with-gaps", draftDigests, selectedRefs: selected,
    checks: [{ id: "review-complete", text: "Checked the saved launch settings.", evidenceRefs }], limits: ["l"] };

  function packet(changes: { readiness?: object; response?: string } = {}): Map<string, Buffer> {
    const readinessText = JSON.stringify({ ...readiness, ...changes.readiness });
    return new Map(Object.entries({
      "readiness.yaml": readinessText,
      "review-scope.json": JSON.stringify({ ...identity, suppliedArtifactRefs: evidenceRefs, limits: ["l"] }),
      "llm/analysis-prompt.md": "Review the saved launch evidence.\n",
      "llm/analysis-response.md": changes.response ?? readinessText,
      "llm/analysis-call.yaml": JSON.stringify({ provider: "fixture", model: "fixture", date: "2026-01-01", settings: "unknown" }),
    }).map(([name, text]) => [name, Buffer.from(text)]));
  }

  test("accepts a readiness review that matches the drafts and selected facts", () => {
    expect(validateRecords({ ...recordInputs(), packet: packet(), draftDigests })).toMatchObject({ mappedFiles: 2 });
  });

  test("refuses a readiness status other than ready-with-gaps", () => {
    expect(() => validateRecords({ ...recordInputs(), packet: packet({ readiness: { status: "ready" } }), draftDigests }))
      .toThrow("Readiness review does not match the current drafts and selected facts.");
  });

  test("refuses a response that does not contain the readiness record", () => {
    expect(() => validateRecords({ ...recordInputs(), packet: packet({ response: "Summary only." }), draftDigests }))
      .toThrow("Incomplete readiness prompt, response or call metadata.");
  });
});
