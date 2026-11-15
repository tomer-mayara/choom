import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { withScratch } from "../../support/commands.ts";
import { savedJson, stageOneRun, stageTwo, stageTwoAttempt, type JsonRecord } from "../../support/stage-2-attempt.ts";

// Start checks the saved Stage 1 run and saves checkpoints of the three drafts.
// A registered artifact that points to a working draft moves to its checkpoint.
interface RunManifest { artifacts: Record<string, { path: string; sha256: string }> }

const id = "s2-check";
const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");

function changeRun(work: string, change: (run: RunManifest) => void): void {
  const run = parse(readFileSync(join(work, "run.yaml"), "utf8")) as RunManifest;
  change(run);
  writeFileSync(join(work, "run.yaml"), stringify(run));
}

describe("Stage 2 start handoff", () => {
  test("moves a registration of the working discovery draft to the attempt checkpoint", () => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stageOneRun(work);
      const discovery = readFileSync(join(work, "discovery.yaml"));
      changeRun(work, (run) => { run.artifacts["discovery-001"] = { path: "discovery.yaml", sha256: sha256(discovery) }; });
      const original = readFileSync(join(work, "run.yaml"));
      const attempt = stageTwoAttempt(work, id);
      const start = stageTwo(attempt, "start");
      expect({ status: start.status, stderr: start.stderr }).toEqual({ status: 0, stderr: "" });
      expect(start.stdout).toStartWith("Saved inputs verified and checkpoints saved. Preserved 1 draft registrations.\n");
      const checkpoint = `evidence/${id}/discovery.before.yaml`;
      const handoff = savedJson(attempt, "handoff.json");
      expect(handoff).toMatchObject({ formatVersion: 1, snapshotRef: "snapshot-check", inventoryRef: "inventory-001",
        registeredArtifacts: ["inventory-001", "s1-file@inventory.mjs", "s1-file@evidence%2Fproducer.json", "exclusions-001",
          "discovery-001"],
        status: "verified", knip: "6.44.1",
        registrationChanges: [{ id: "discovery-001", from: "discovery.yaml", to: checkpoint, sha256: sha256(discovery) }],
        originalRunSha256: sha256(original), finalRunSha256: sha256(readFileSync(join(work, "run.yaml"))) });
      expect(readFileSync(join(attempt.folder, "run.input.yaml")).equals(original)).toBe(true);
      expect(readFileSync(join(attempt.folder, "run.before.yaml")).equals(readFileSync(join(work, "run.yaml")))).toBe(true);
      expect((parse(readFileSync(join(work, "run.yaml"), "utf8")) as RunManifest).artifacts["discovery-001"])
        .toEqual({ path: checkpoint, sha256: sha256(discovery) });
      expect(readFileSync(join(attempt.folder, "discovery.before.yaml")).equals(discovery)).toBe(true);
    });
  });

  const refusals: { name: string; change: (work: string) => void; message: string }[] = [
    { name: "a registered artifact changed", message: "Missing or changed registered artifact: inventory-001",
      change: (work) => changeRun(work, (run) => { run.artifacts["inventory-001"] = { path: "evidence/inventory.json",
        sha256: "0".repeat(64) }; }) },
    { name: "the saved inventory helper prints a different inventory",
      message: "Saved inventory check failed. Restore the snapshot or start a new stage-1 run.",
      change: (work) => {
        writeFileSync(join(work, "inventory.mjs"), "process.stdout.write('{}');\n");
        changeRun(work, (run) => { run.artifacts["s1-file@inventory.mjs"] = { path: "inventory.mjs",
          sha256: sha256("process.stdout.write('{}');\n") }; });
      } },
    { name: "the baseline is no longer empty", message: "Expected completed stage 1 and an empty baseline before stage 3.",
      change: (work) => writeFileSync(join(work, "baseline.yaml"), stringify({ formatVersion: 1, id: "baseline-check",
        parentId: null, components: [{ id: "app" }], interfaces: [], resources: [], rules: [] })) },
  ];

  test.each(refusals)("refuses to start when $name", ({ change, message }) => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      stageOneRun(work);
      change(work);
      const attempt = stageTwoAttempt(work, id);
      const start = stageTwo(attempt, "start");
      expect(start.status).toBe(1);
      expect(start.stderr).toContain("Error: " + message);
      expect(start.stderr).toContain("Saved command failed: operator-start-handoff.sh");
      const receipt = savedJson(attempt, "operator-start.json");
      expect(receipt).toMatchObject({ exitCode: 1, error: "Saved command failed: operator-start-handoff.sh" });
      expect((receipt.commands as JsonRecord[]).map(({ exitCode }) => exitCode)).toEqual([1]);
    });
  });
});
