import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify } from "yaml";

export const stagedSnapshotRef = "snapshot-check";
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

// A saved snapshot file. A "symlink" record is listed in the inventory only.
export interface SnapshotFile { path: string; text: string; kind?: "file" | "symlink" }
export interface StagedRunOptions { snapshot?: SnapshotFile[]; questions?: unknown[] }

const defaultSnapshot: SnapshotFile[] = [{ path: "app.ts", text: "export const value = 1;\n" }];

// Writes the drafts and registered records that a run has after Stage 1, 2 or 3.
// Each stage start checks only part of them; the values are the smallest that pass.
export function stagedRun(work: string, finishedStage: 1 | 2 | 3, options: StagedRunOptions = {}): void {
  const snapshotRef = stagedSnapshotRef;
  const artifacts: Record<string, { path: string; sha256: string }> = {};
  function save(path: string, text: string, ref?: string): void {
    mkdirSync(dirname(join(work, path)), { recursive: true });
    writeFileSync(join(work, path), text);
    if (ref) artifacts[ref] = { path, sha256: sha256(text) };
  }
  const snapshot = options.snapshot ?? defaultSnapshot;
  for (const file of snapshot) if (file.kind !== "symlink") save("snapshot/" + file.path, file.text);
  const files = snapshot.map(({ path, text, kind }) => ({ path, kind: kind ?? "file", bytes: Buffer.byteLength(text),
    sha256: sha256(text) }));
  const inventory = JSON.stringify({ formatVersion: 1, snapshotId: snapshotRef, files }, null, 2) + "\n";
  save("evidence/inventory.json", inventory, "inventory-001");
  save("inventory.mjs", `process.stdout.write(${JSON.stringify(inventory)});\n`, "s1-file@inventory.mjs");
  const progress: Record<string, string> = { inventory: "complete", baselineRecovery: "pending" };
  const discovery: Record<string, unknown> = { formatVersion: 1, kind: "architecture-discovery", runRef: "run-check",
    questions: options.questions ?? [], gaps: [] };
  if (finishedStage >= 2) {
    save("evidence/s2-check/entry-plan.json", JSON.stringify({ formatVersion: 1, snapshotRef,
      workspaces: [{ dir: ".", entry: ["app.ts"] }] }), "s2-check-entry-plan");
    save("evidence/s2-check/knip-runs.json", JSON.stringify({ formatVersion: 1, snapshotRef, runs: [] }), "s2-check-knip-runs");
    const analysis = { formatVersion: 1, kind: "entry-analysis", snapshotRef, planRef: "s2-check-entry-plan",
      knipRunsRef: "s2-check-knip-runs" };
    save("evidence/s2-check/entry-analysis.yaml", stringify(analysis), "s2-check-entry-analysis");
    Object.assign(progress, { entryAnalysis: "complete" });
    discovery.entryAnalysisRef = "s2-check-entry-analysis";
    if (finishedStage === 3) {
      save("evidence/settings.json", JSON.stringify({ formatVersion: 1, snapshotId: snapshotRef, configs: [], packages: [] }),
        "settings-001");
      save("evidence/s3-check/loading-search.json", JSON.stringify({ snapshotRef, status: "completed",
        scope: [{ path: "app.ts", sha256: files[0]?.sha256 }] }), "s3-check-file@loading-search.json");
      save("evidence/s3-check/entry-analysis.yaml", stringify({ ...analysis, knipAssessment: { action: "reuse" },
        inspectionPriorities: [{ id: "first", priority: 1 }] }), "s3-check-entry-analysis");
      Object.assign(progress, { inspectionPriorities: "complete" });
      discovery.entryAnalysisRef = "s3-check-entry-analysis";
    }
  }
  save("run.yaml", stringify({ formatVersion: 1, id: "run-check", mode: "A", status: "in-progress", progress,
    snapshot: { id: snapshotRef, root: "snapshot", inventoryRef: "inventory-001" }, artifacts }));
  save("discovery.yaml", stringify(discovery));
  save("baseline.yaml", stringify({ formatVersion: 1, id: "baseline-check", parentId: null,
    components: [], interfaces: [], resources: [], rules: [] }));
}
