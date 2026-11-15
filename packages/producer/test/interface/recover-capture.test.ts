import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify } from "yaml";
import { producerCommands } from "../../src/cli.ts";
import { producerDocuments, producerSource, runCli, toolsRoot, withScratch } from "../support/commands.ts";
import { settingsTarget, writeFiles } from "../support/stage-1-run.ts";

// A recovery capture copies the retained files of an earlier run into a new run
// and collects their settings with the Stage 1 settings collector.
interface SettingsCommand { args: string[]; exitCode: number; cwd: string }
interface SettingsRecord { snapshotId: string; configs: { path: string }[]; contentReads: { path: string }[] }

const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const expected = JSON.parse(readFileSync(new URL("../fixtures/stage-1/settings.json", import.meta.url), "utf8")) as SettingsRecord;

// An earlier run with the Stage 1 settings fixture as its snapshot.
function earlierRun(previous: string): void {
  writeFiles(join(previous, "snapshot"), settingsTarget);
  const files = Object.keys(settingsTarget).sort().map((path) => ({ path, kind: "file",
    bytes: Buffer.byteLength(settingsTarget[path] ?? ""), sha256: sha256(settingsTarget[path] ?? "") }));
  const inventory = JSON.stringify({ formatVersion: 1, snapshotId: "snapshot-old", files }, null, 2);
  writeFiles(previous, { "evidence/inventory.json": inventory, "exclusions.txt": "node_modules\n" });
  writeFiles(previous, { "run.yaml": stringify({ formatVersion: 1, id: "run-old", mode: "A",
    snapshot: { id: "snapshot-old", root: "snapshot", inventoryRef: "inventory-001", exclusions: "exclusions.txt" },
    artifacts: { "inventory-001": { path: "evidence/inventory.json", sha256: sha256(inventory) },
      "exclusions-001": { path: "exclusions.txt", sha256: sha256("node_modules\n") } } }) });
}

describe("recovery capture", () => {
  test("copies the retained files and collects their settings with the saved settings collector", () => {
    withScratch((scratch) => {
      const previous = join(scratch, "previous");
      const work = join(scratch, "recovered");
      earlierRun(previous);
      const result = runCli(["recover-capture"], { CHOOM_TOOLS: toolsRoot, CHOOM_PREVIOUS_WORK: previous, CHOOM_WORK: work,
        CHOOM_RUN_ID: "run-new", CHOOM_SNAPSHOT_ID: "snapshot-new" });
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
      const bytes = Object.values(settingsTarget).reduce((sum, text) => sum + Buffer.byteLength(text), 0);
      expect(result.stdout).toBe(`Recovered snapshot-new: 10 files, ${bytes} bytes; settings collected. Stage 1 review is pending.\n`);

      const settings = JSON.parse(readFileSync(join(work, "evidence/settings.json"), "utf8")) as SettingsRecord;
      expect(settings).toEqual({ ...expected, snapshotId: "snapshot-new",
        configs: expected.configs.filter(({ path }) => path !== "/repo/configs/custom.json"),
        contentReads: expected.contentReads.filter(({ path }) => path !== "configs/custom.json") });
      const command = JSON.parse(readFileSync(join(work, "evidence/settings-command.json"), "utf8")) as SettingsCommand;
      const [collector] = command.args.slice(1);
      expect({ folder: dirname(collector ?? ""), cwd: command.cwd, exitCode: command.exitCode }).toEqual({ folder: work,
        cwd: work, exitCode: 0 });

      const helper = readFileSync(join(producerSource, producerCommands.get("recover-capture")?.helper ?? ""));
      const report = JSON.parse(readFileSync(join(work, "evidence/capture-recovery.json"), "utf8")) as Record<string, unknown>;
      expect(report).toMatchObject({ status: "completed", helperSha256: sha256(helper),
        settingsSha256: sha256(readFileSync(join(work, "evidence/settings.json"))) });
      expect(readFileSync(join(work, "evidence/cookbook.md")).equals(readFileSync(join(producerDocuments, "step-1-cookbook.md"))))
        .toBe(true);
    });
  }, 60_000);
});
