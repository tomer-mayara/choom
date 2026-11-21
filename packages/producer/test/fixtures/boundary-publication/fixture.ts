import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BaselineBoundaryReview, BaselineV6, BaselineRuleObject, BoundaryAccess, BoundaryAccessKind, BoundaryRole }
  from "@choom/baseline-model/contracts";
import * as tsMorph from "ts-morph";
import { divideFile } from "../../../src/code-units.ts";
import { parseSnapshotText } from "../../../src/snapshot-project.ts";
import { parse, stringify } from "yaml";
import { stageFourPublication, publishStageFour, type StageFourPublication } from "../stage-4-publication/fixture.ts";
import { component, membershipRef, runStageFive, writeStageFivePacket, publishStageFive, type StageFivePublication }
  from "../stage-5-publication/fixture.ts";
import { stageSix } from "../../support/stage-6-run.ts";
import type { CommandResult } from "../../support/commands.ts";

export type HistoryRoute = "none" | "direct" | "indirect" | "unresolved";
export const sourcePaths = {
  collector: "src/collector.ts", history: "src/history/read.ts", helper: "src/history/helper.ts",
  loader: "src/config/loader.ts", test: "test/adapter.ts", port: "src/storage/port.ts",
  emitted: "dist/test/adapter.js", map: "dist/test/adapter.js.map", policy: ".dependency-cruiser.json",
};
const stableMembers = { collector: "collect", history: "read", helper: "prepare", loader: "GlobalConfigLoader.load",
  test: "fixture", port: "commit" };
const labels = { collector: "Local collector", history: "Local Codex history", configuration: "Configuration",
  test: "In-memory test adapter", storage: "Storage" };
type ComponentKey = keyof typeof labels;
const purpose = { collector: "Run the history command.", history: "Read local history.", configuration: "Load configuration.",
  test: "Supply an in-memory test fixture.", storage: "Declare the storage port." };
const owners: Record<keyof typeof stableMembers, ComponentKey> = {
  collector: "collector", history: "history", helper: "history", loader: "configuration", test: "test", port: "storage",
};
const policyId = "history-receives-global-config";
const settings = { name: policyId, severity: "error", from: { path: "^src/history/read\\.ts$" },
  to: { path: "^src/config/loader\\.ts$", reachable: true } };
const projectKey = "TraceRelic";
export const proposalPath = "baselines/baseline-check/baseline.yaml";
export const limit = "Only the saved storage declaration was inspected for additional callers.";
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const sourceRef = (path: string) => "s4-check-source-" + encodeURIComponent(path);
const version = "s6-boundaries";
const dependencyKinds: BoundaryAccessKind[] = ["import", "re-export", "require", "dynamic-import", "type"];
const sourceUnits = Object.keys(stableMembers) as (keyof typeof stableMembers)[];
const statement = <T>(value: T, evidenceRefs: string[]) => ({ value, status: "proposed" as const, evidenceRefs });
const text = (data: unknown) => stringify(data, { aliasDuplicateObjects: false });
export function fixtureValue<T>(value: T | undefined): T {
  assert.ok(value !== undefined, "The reviewed fixture needs its named record.");
  return value;
}

export function success(result: CommandResult): void {
  assert.equal(result.status, 0, result.stderr);
}

function sourceFiles(route: HistoryRoute) {
  const load = "import { GlobalConfigLoader } from '../config/loader'; ";
  const testCall = "import { commit } from '../src/storage/port'; export function fixture() { return commit(); }";
  return {
    collector: "import { GlobalConfigLoader } from './config/loader'; import { prepare } from './history/helper'; export function collect() { prepare(); return GlobalConfigLoader.load(); }",
    history: route === "none" ? "export function read(config: object) { return config; }" :
      route === "direct" ? load + "export function read() { return GlobalConfigLoader.load(); }" :
      route === "unresolved" ? "export function read(path: string) { return import(path); }" :
      "import { prepare } from './helper'; export function read() { return prepare(); }",
    helper: load + "export function prepare() { return GlobalConfigLoader.load(); }",
    loader: "export class GlobalConfigLoader { static load() { return {}; } }",
    test: testCall, port: "export function commit() { return 0; } export function readCheckpoint() { return null; }",
    emitted: testCall.replace("../src/storage/port", "../../src/storage/port") + " //# sourceMappingURL=adapter.js.map",
    map: JSON.stringify({ version: 3, file: "adapter.js", sources: ["../../test/adapter.ts"], names: [],
      mappings: sourceMapping(testCall.indexOf("return commit") + 7, testCall.indexOf("return commit") + 10) }),
    policy: JSON.stringify({ forbidden: [settings] }),
  };
}

function sourceMapping(sourceColumn: number, emittedColumn: number): string {
  const encode = (value: number) => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let rest = value * 2;
    let answer = "";
    do {
      const bits = rest % 32;
      rest = Math.floor(rest / 32);
      answer += alphabet[bits + (rest > 0 ? 32 : 0)];
    } while (rest > 0);
    return answer;
  };
  return encode(emittedColumn) + "AA" + encode(sourceColumn);
}

function observations(route: HistoryRoute, context: string): BoundaryAccess[] {
  type Key = keyof typeof stableMembers | "emitted";
  const site = (caller: Key, target: keyof typeof stableMembers, route: string, kind: BoundaryAccessKind): BoundaryAccess => {
    const targetRef = sourceRef(sourcePaths[target]);
    const callerRef = sourceRef(sourcePaths[caller]);
    return { id: caller + "-" + target + "-" + kind, callerUnitId: caller, writtenPath: route,
      member: stableMembers[target], targetUnitId: target, operationId: target, kind, context,
      callerRole: caller === "test" || caller === "emitted" ? "test" : "production", targetRole: "production",
      callerRef, evidenceRefs: [callerRef, targetRef] };
  };
  const pair = (caller: Key, target: keyof typeof stableMembers, path: string) =>
    [site(caller, target, path, "import"), site(caller, target, path, "call")];
  const result = [...pair("collector", "loader", "./config/loader"), ...pair("collector", "helper", "./history/helper"), ...pair("helper", "loader", "../config/loader"),
    ...pair("test", "port", "../src/storage/port")];
  if (route === "direct") result.push(...pair("history", "loader", "../config/loader"));
  if (route === "indirect") result.push(...pair("history", "helper", "./helper"));
  if (route === "unresolved") result.push({ id: "history-unresolved", callerUnitId: "history", writtenPath: "path",
    targetUnitId: null, member: null, kind: "dynamic-import", context, callerRole: "production", targetRole: "unknown",
    callerRef: sourceRef(sourcePaths.history), evidenceRefs: [sourceRef(sourcePaths.history)], reason: "Computed path." });
  return result;
}

function boundaryReview(route: HistoryRoute, files: ReturnType<typeof sourceFiles>, stage: string, work: string,
  context: string): BaselineBoundaryReview {
  const refs = (key: keyof typeof sourcePaths) => [sourceRef(sourcePaths[key])];
  const roles = (key: string): BoundaryRole[] => key === "test" || key === "emitted" ? ["test"] : ["production"];
  const ruleUnits = ["history", "loader", ...(route === "indirect" ? ["helper"] : [])];
  const inventoryDigest = hash(readFileSync(join(work, "evidence/inventory.json")));
  return {
    status: "current", identity: { projectKey, snapshotRef: "snapshot-check", inventoryDigest, sourceKind: "snapshot",
      baseCommit: null, analysisRoots: ["src", "test", "dist"], mappingRef: stage + "-file@code-mapping.json" },
    componentScopes: (Object.keys(labels) as ComponentKey[]).map((id) => ({ componentId: id, name: labels[id],
      purpose: purpose[id], roles: roles(id), basis: "declaration",
      evidenceRefs: refs(fixtureValue(sourceUnits.find((key) => owners[key] === id))) })),
    units: sourceUnits.map((id) => ({ id, path: sourcePaths[id], unitKind: "file", ownerId: owners[id],
      roles: roles(id), evidenceRefs: refs(id) })),
    operations: sourceUnits.map((id) => ({ id, unitId: id, name: stableMembers[id] + "()", member: stableMembers[id],
      visibility: id === "helper" ? "unknown" : "public", roles: roles(id), evidenceRefs: refs(id),
      ...(id === "loader" ? { interfaceId: "loader-interface" } : {}) })),
    accesses: observations(route, context), rules: [{ id: policyId, name: "History receives configuration from its caller",
      kind: "reachability", authority: "repository", revision: hash(files.policy + "\n"), scope: "History source in the import context.",
      settings, accessKinds: dependencyKinds, evidenceRefs: refs("policy") }],
    checks: [{ id: "history-loader-check", ruleId: policyId, sourceUnitId: "history", targetUnitId: "loader", context,
      checker: "choom-source-graph", checkerVersion: "1", result: route === "none" ? "absent" :
        route === "unresolved" ? "unknown" : "forbidden", accessIds: route === "indirect" ?
        ["history-helper-import", "helper-loader-import"] : route === "direct" ? ["history-loader-import"] : [],
      coverage: { status: route === "unresolved" ? "partial" : "complete", roots: [sourcePaths.history],
        examinedUnitIds: ruleUnits, accessKinds: dependencyKinds, missingRoots: [],
        unresolvedAccessIds: route === "unresolved" ? ["history-unresolved"] : [],
        limitations: route === "unresolved" ? ["Computed target."] : [] }, evidenceRefs: refs("policy") }],
    callerSearches: [{ operationId: "port", role: "production", coverage: { status: "partial", roots: ["src"],
      examinedUnitIds: ["port"], accessKinds: ["call"], missingRoots: [], unresolvedAccessIds: [], limitations: [limit] },
      evidenceRefs: refs("port") }],
    sourceNotes: (Object.keys(files) as (keyof typeof files)[]).map((key) => ({ evidenceRef: sourceRef(sourcePaths[key]),
      description: "Reviewed " + key + " source.", location: { path: sourcePaths[key], sha256: hash(files[key] + "\n"),
        snapshotRef: "snapshot-check", lines: [1, 1] } })), matches: [], limitations: [limit],
  };
}

export function stageFourBoundary(route: HistoryRoute, additional?: { direct?: "call" | "import"; options?: BaselineRuleObject; reference?: string }): StageFourPublication {
  const files = sourceFiles(route);
  if (additional?.options) files.policy = JSON.stringify({ forbidden: [settings], options: additional.options });
  const keys = Object.keys(files) as (keyof typeof files)[];
  const extra: { path: string; text: string }[] = keys.map((key) => ({ path: sourcePaths[key], text: files[key] + "\n" }));
  const directPath = ".choom-boundaries.json";
  const direct = additional?.direct;
  const directRule = { id: "direct-policy", kind: direct === "call" ? "visibility" as const : "path" as const,
    settings: direct === "call" ? { member: "GlobalConfigLoader.load", visibility: "private" } : { path: "./config/loader", permission: "forbidden" },
    accessKinds: [direct ?? "call"] };
  const directText = JSON.stringify({ boundaryRules: [directRule] }) + "\n";
  if (direct) extra.push({ path: directPath, text: directText });
  const edges = observations(route, "fixture").filter((site) => site.kind !== "call").map((site) => ({
    from: sourcePaths[site.callerUnitId as keyof typeof sourcePaths],
    to: site.targetUnitId === null ? null : sourcePaths[site.targetUnitId as keyof typeof sourcePaths], specifier: site.writtenPath }));
  edges.push({ from: sourcePaths.emitted, to: sourcePaths.port, specifier: "../../src/storage/port" });
  return stageFourPublication((baseline) => {
    baseline.formatVersion = 6;
    for (const id of Object.keys(labels) as ComponentKey[]) {
      const paths = sourceUnits.filter((key) => owners[key] === id).map((key) => sourcePaths[key]);
      baseline.components.push({ ...component(id, { paths }), name: labels[id], purpose: statement(purpose[id], [sourceRef(fixtureValue(paths[0]))] ) });
    }
    baseline.interfaces.push({ id: "loader-interface", name: "Configuration loader",
      owner: statement("configuration", ["launch-settings"]), publicAccess: statement(["GlobalConfigLoader.load"], ["launch-settings"]),
      allowedConsumers: statement(null, ["launch-settings"]), promises: statement(null, ["launch-settings"]) });
  }, extra, undefined, (records, prepared) => {
    const graph = JSON.parse(readFileSync(join(prepared.attempt, "graph-results.json"), "utf8")) as { contexts: { id: string }[] };
    const context = fixtureValue(graph.contexts[0]).id;
    const review = boundaryReview(route, files, "s4-check", prepared.work, context);
    fixtureValue(records["baseline.proposed.yaml"]).boundaryReview = review;
    if (additional?.reference) review.identity.referenceDigest = hash(additional.reference);
    if (additional?.options) fixtureValue(review.rules[0]).settings = { rule: settings, options: additional.options };
    if (direct) {
      const evidenceRef = sourceRef(directPath);
      review.sourceNotes.push({ evidenceRef, description: "Reviewed the direct policy.", location: {
        path: directPath, sha256: hash(directText), snapshotRef: "snapshot-check", lines: [1, 1] } });
      review.rules.push({ ...directRule, settings: JSON.parse(JSON.stringify(directRule.settings)), name: "Direct policy", scope: "Collector to configuration",
        authority: "repository", revision: hash(directText), evidenceRefs: [evidenceRef] });
      review.checks.push({ id: "direct-check", ruleId: directRule.id, checker: "choom-boundary", checkerVersion: "1", context,
        sourceUnitId: "collector", targetUnitId: "loader", result: "absent", accessIds: [], coverage: {
          status: "complete", roots: [sourcePaths.collector], examinedUnitIds: ["collector", "loader"],
          accessKinds: [direct], missingRoots: [], unresolvedAccessIds: [], limitations: [] }, evidenceRefs: [evidenceRef] });
    }
    const gap = { id: "unknown-loader-policy", kind: "policy", reason: "No complete caller policy was declared.",
      subjectRefs: ["loader-interface.allowedConsumers"], evidenceRefs: [sourceRef(sourcePaths.loader)] };
    for (const name of ["entry-analysis.yaml", "discovery.proposed.yaml"]) fixtureValue(records[name]).gaps = [...fixtureValue(records[name]).gaps as unknown[], gap];
  }, { key: projectKey, reference: additional?.reference, reviewPaths: extra.map((file) => file.path), edges });
}

export function stageFiveBoundary(route: HistoryRoute, divide = false): StageFivePublication {
  const four = stageFourBoundary(route);
  success(publishStageFour(four, "finish"));
  success(runStageFive(four, ["start"]));
  success(runStageFive(four, ["collect"]));
  return writeStageFivePacket({ ...four, stageFive: join(four.work, "evidence/s5-check") }, {
    baseline(baseline) {
      const review = baseline.boundaryReview as BaselineBoundaryReview;
      review.identity.mappingRef = "s5-check-file@code-mapping.json";
      const tested = fixtureValue(review.accesses.find((site) => site.id === "test-port-call"));
      tested.emittedCopies = [{ sourceRef: tested.callerRef, emittedRef: sourceRef(sourcePaths.emitted), proofRef: sourceRef(sourcePaths.map) }];
      const declaration = fixtureValue(review.operations.find((op) => op.id === "port"));
      review.operations.push({ ...declaration, id: "checkpoint", member: "readCheckpoint", name: "readCheckpoint()" });
      review.callerSearches.push({ operationId: "checkpoint", role: "production",
        coverage: { status: route === "unresolved" ? "partial" : "complete", roots: ["src"],
          examinedUnitIds: ["collector", "history", "helper", "loader", "port", ...(divide ? ["helper-rest"] : [])],
          accessKinds: ["call"], missingRoots: [], unresolvedAccessIds: route === "unresolved" ? ["history-unresolved"] : [],
          limitations: route === "unresolved" ? ["A computed loader has no binding."] : [] }, evidenceRefs: declaration.evidenceRefs });
      if (!divide) return;
      fixtureValue(baseline.components.find((item) => item.id === "storage")).membership.value.symbols = [{ path: sourcePaths.helper, symbol: "prepare" }];
      const unit = fixtureValue(review.units.find((unit) => unit.id === "helper"));
      review.units.push({ ...unit, id: "helper-rest", unitKind: "rest" });
      Object.assign(unit, { unitKind: "symbol", symbol: "prepare", ownerId: "storage" });
    },
    mapping(mapping, baseline) {
      if (!divide) return;
      mapping.scope.unitKind = "file-or-part";
      const source = sourceFiles(route).helper + "\n";
      const division = divideFile(tsMorph.ts, parseSnapshotText(sourcePaths.helper, Buffer.from(source), tsMorph), ["prepare"]);
      mapping.units = mapping.units.flatMap((unit) => unit.path !== sourcePaths.helper ? [{ ...unit, unitKind: "file" }] : [
        { ...unit, id: "helper-symbol-unit", unitKind: "symbol", symbol: "prepare", ranges: fixtureValue(division.symbols[0]).ranges,
          owner: "storage", membershipRef: membershipRef(baseline, "storage") },
        { ...unit, id: "helper-rest-unit", unitKind: "rest", ranges: division.rest },
      ]);
    },
  });
}

export function readProposal(fixture: StageFourPublication): BaselineV6 {
  return parse(readFileSync(join(fixture.work, "baseline.yaml"), "utf8")) as BaselineV6;
}

export function rewriteProposal(folder: string, change: (baseline: BaselineV6) => void): void {
  const path = join(folder, "baseline.proposed.yaml");
  const old = readFileSync(path, "utf8");
  const baseline = parse(old) as BaselineV6;
  change(baseline);
  const next = text(baseline);
  writeFileSync(path, next);
  const response = join(folder, "llm/analysis-response.md");
  writeFileSync(response, readFileSync(response, "utf8").replace(old.trimEnd(), () => next.trimEnd()));
}

export function readiness(five: StageFivePublication, includeCheck = true): string {
  success(publishStageFive(five, "finish"));
  return writeReadiness(five, includeCheck);
}

export function writeReadiness(five: StageFivePublication, includeCheck: boolean): string {
  const folder = join(five.root, "readiness");
  mkdirSync(join(folder, "llm"), { recursive: true });
  const discovery = parse(readFileSync(join(five.work, "discovery.yaml"), "utf8")) as Record<string, string>;
  const identity = { formatVersion: 1, runRef: "run-check", snapshotRef: "snapshot-check", baselineId: "baseline-check" };
  const references = ["s5-check-file@baseline.proposed.yaml#/boundaryReview", "s5-check-file@code-mapping.json",
    "s5-check-file@baseline.proposed.yaml#/boundaryReview/limitations"];
  const record = { ...identity, status: "ready-with-gaps", draftDigests: Object.fromEntries(
    ["run.yaml", "baseline.yaml", "discovery.yaml"].map((name) => [name, hash(readFileSync(join(five.work, name)))])),
    selectedRefs: Object.fromEntries(["codeMappingRef", "entryAnalysisRef", "dependenciesRef", "resourceAccessRef"]
      .map((key) => [key, discovery[key]])), checks: [
      { id: "review-complete", text: "Traced the selected snapshot.", evidenceRefs: ["launch-settings"] },
      ...(includeCheck ? [{ id: "boundary-review", text: "Collector loads configuration. A test fixture calls commit. " + limit,
        evidenceRefs: references }] : []),
    ], limits: [limit] };
  writeFileSync(join(folder, "readiness.yaml"), text(record));
  writeFileSync(join(folder, "review-scope.json"), JSON.stringify({ ...identity, suppliedArtifactRefs: references, limits: [limit] }));
  writeFileSync(join(folder, "llm/analysis-prompt.md"), "Trace the production operation, test fixture and coverage limit.\n");
  writeFileSync(join(folder, "llm/analysis-response.md"), text(record));
  writeFileSync(join(folder, "llm/analysis-call.yaml"), text({ provider: "fixture", model: "fixture", date: "2026-11-19",
    settings: "unknown", hiddenReasoning: "not-saved" }));
  return folder;
}

export function saveSix(five: StageFivePublication, args: readonly string[]): CommandResult {
  return stageSix(five.work, version, args);
}
