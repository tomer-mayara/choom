import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { type CommandResult, runCli, withScratch } from "../../support/commands.ts";
import { completedRun, type CompletedRunFixture, copyRunFolder, type DecisionEntry, type DecisionFile, decisionFileYaml,
  stageSixAttempt } from "../../support/completed-run.ts";
import { folderState } from "../../support/producer-record.ts";

// The baseline next command on copies of one run that the Stage 6 command line
// completed. The command makes the version with @choom/baseline-model, so this is
// an integration suite. Each test saves its decision record in the run folder as
// baseline decide saves a decision file. A fictional model made the readiness
// review of the run.
type Fields = Record<string, unknown>;

const model = "Fictional Model 7";
const callRecord = `evidence/${stageSixAttempt}/llm/analysis-call.yaml`;
const versionId = "fixture-baseline-decisions-001";
const versionFolder = `baselines/${versionId}`;
const recordPath = "decisions/decisions-001.yaml";
const usage = "Use baseline decide --run RUN_FOLDER DECISION_FILE, or baseline next --run RUN_FOLDER --decisions DECISION_ID.\n";
const acceptPurpose: DecisionEntry = { action: "accept", itemId: "cli", field: "purpose" };
const correctGrouping: DecisionEntry = { action: "correct", itemId: "mcp", field: "groupingReason",
  oldValue: "One reviewed boundary.", newValue: "The MCP search tool." };
const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
let published: CompletedRunFixture;

beforeAll(async () => {
  published = await completedRun(model);
}, 60_000);

afterAll(() => rmSync(published.root, { recursive: true, force: true }));

const copiedRun = (scratch: string): string => copyRunFolder(published, scratch);

// Saves a decision record as decisions/<file>.yaml in the run copy, and returns its bytes.
function saveRecord(work: string, entries: DecisionEntry[], change: Partial<DecisionFile> = {}, file = change.id ?? "decisions-001"):
  Buffer {
  const bytes = Buffer.from(decisionFileYaml({ ...published, work }, entries, change));
  mkdirSync(join(work, "decisions"), { recursive: true });
  writeFileSync(join(work, `decisions/${file}.yaml`), bytes);
  return bytes;
}

const next = (work: string, id = "decisions-001"): CommandResult => runCli(["baseline", "next", "--run", work, "--decisions", id]);

function made(work: string, id?: string): Fields {
  const result = next(work, id);
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
  return JSON.parse(result.stdout) as Fields;
}

// A refused command writes nothing in the run folder.
function expectRefused(work: string, stderr: string | RegExp, id?: string): void {
  const before = folderState(work);
  const result = next(work, id);
  expect({ status: result.status, stdout: result.stdout }).toEqual({ status: 1, stdout: "" });
  if (typeof stderr === "string") expect(result.stderr).toBe(stderr);
  else expect(result.stderr).toMatch(stderr);
  expect(folderState(work)).toEqual(before);
}

describe("baseline next", () => {
  test("saves the version and its version record once, and changes no other file of the run", () => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      const record = saveRecord(work, [acceptPurpose, correctGrouping]);
      const before = folderState(work);
      const output = made(work);
      const version = readFileSync(join(work, versionFolder, "baseline.yaml"));
      const versionRecord = readFileSync(join(work, versionFolder, "version.json"));
      const parent = { id: published.baselineId, path: published.baselinePath, sha256: sha256(readFileSync(join(work, published.baselinePath))) };
      const decisions = { id: "decisions-001", path: recordPath, sha256: sha256(record) };
      expect(output).toEqual({ status: "version-made", id: versionId, path: `${versionFolder}/baseline.yaml`, sha256: sha256(version),
        parent, decisions, versionRecord: { path: `${versionFolder}/version.json`, sha256: sha256(versionRecord) },
        statements: [{ action: "accept", statement: "cli.purpose" }, { action: "correct", statement: "mcp.groupingReason" }],
        deciderCheck: { llmCallRecords: [callRecord], models: [model] },
        limits: [expect.stringContaining("no discovery result"), expect.stringContaining("process rule"),
          expect.stringContaining("does not change")],
        writes: [`${versionFolder}/baseline.yaml`, `${versionFolder}/version.json`] });
      expect(JSON.parse(versionRecord.toString("utf8"))).toEqual({ formatVersion: 1,
        baseline: { id: versionId, path: `${versionFolder}/baseline.yaml`, sha256: sha256(version) }, parent, decisions });
      const isVersion = ([path]: [string, string]): boolean => path === versionFolder || path.startsWith(`${versionFolder}/`);
      const after = folderState(work);
      expect(after.filter((entry) => !isVersion(entry))).toEqual(before);
      expect(after.filter(isVersion)).toEqual([[versionFolder, "folder"], [`${versionFolder}/baseline.yaml`, sha256(version)],
        [`${versionFolder}/version.json`, sha256(versionRecord)]]);
      const manifest = parse(readFileSync(join(work, "run.yaml"), "utf8")) as { artifacts: Record<string, { sha256: string }> };
      expect(manifest.artifacts[published.baselineId]?.sha256).toBe(parent.sha256);
    });
  });

  test("saves the published baseline as the parent, with the decided statements accepted and the new value", () => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      saveRecord(work, [acceptPurpose, correctGrouping]);
      made(work);
      const expected = parse(readFileSync(join(work, published.baselinePath), "utf8")) as { components: Fields[] } & Fields;
      const component = (id: string): Fields => expected.components.find((item) => item.id === id) ?? {};
      Object.assign(expected, { id: versionId, parentId: published.baselineId });
      Object.assign(component("cli").purpose as Fields, { status: "accepted", acceptanceRef: "decisions-001" });
      Object.assign(component("mcp").groupingReason as Fields, { value: "The MCP search tool.", status: "accepted",
        acceptanceRef: "decisions-001" });
      expect(parse(readFileSync(join(work, versionFolder, "baseline.yaml"), "utf8"))).toEqual(expected);
    });
  });

  test("refuses a second version from the same decision record, and keeps the first version", () => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      saveRecord(work, [acceptPurpose]);
      made(work);
      expectRefused(work, `The baseline version ${versionId} is saved already: ${versionFolder}. A saved version does not change. ` +
        "Make another version from a new decision record.\n");
    });
  });

  test("makes another version of the published baseline from another decision record", () => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      saveRecord(work, [acceptPurpose]);
      made(work);
      saveRecord(work, [correctGrouping], { id: "decisions-002" });
      expect(made(work, "decisions-002")).toMatchObject({ id: "fixture-baseline-decisions-002", parent: { id: published.baselineId } });
      const versions = folderState(work).filter(([path, state]) => path.startsWith("baselines/") && state === "folder");
      expect(versions.map(([path]) => path)).toEqual([published.baselinePath.replace("/baseline.yaml", ""), versionFolder,
        "baselines/fixture-baseline-decisions-002"]);
    });
  });

  test("refuses decisions that do not fit the published baseline, with every problem", () => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      saveRecord(work, [{ action: "accept", itemId: "billing", field: "purpose" },
        { action: "correct", itemId: "http", field: "purpose", oldValue: "Provide the orders", newValue: "Bill the orders" }]);
      expectRefused(work, `Cannot make the next version from ${recordPath}:\n` +
        `- entries.0: billing.purpose is not a statement of baseline ${published.baselineId}.\n` +
        '- entries.1: the old value of http.purpose is not the current value. Expected oldValue: "Provide http". ' +
        'Given oldValue: "Provide the orders".\n');
    });
  });

  test("refuses a decider that is the model of the run", () => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      saveRecord(work, [acceptPurpose], { decider: { name: " fictional model 7", kind: "human" } });
      expectRefused(work, `Cannot make the next version from ${recordPath}:\n- The decider " fictional model 7" is the model ` +
        `"${model}" of the LLM call record ${callRecord}. A model cannot accept or correct statements. ` +
        "Name the person who made the decisions.\n");
    });
  });

  test("refuses a decision record whose ID is not the ID of its file", () => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      saveRecord(work, [acceptPurpose], {}, "decisions-009");
      expectRefused(work, "Cannot make the next version from decisions/decisions-009.yaml:\n- The record has the ID " +
        "decisions-001. A saved decision record has the ID of its file name.\n", "decisions-009");
    });
  });

  test.each([
    ["no saved decision record", "decisions-001", "The run has no decision record decisions-001: decisions/decisions-001.yaml is " +
      "missing or is not a regular file.\n"],
    ["an ID that is a path", "../decisions-001", 'Not a decision record ID: "../decisions-001".\n'],
    ["an ID in capital letters", "Decisions-001", 'Not a decision record ID: "Decisions-001".\n'],
  ])("refuses %s, with the message of the decision record reader", (_name, id, stderr) => {
    withScratch((scratch) => expectRefused(copiedRun(scratch), stderr, id));
  });

  test("refuses a saved decision record that the bounded YAML profile refuses", () => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      mkdirSync(join(work, "decisions"));
      writeFileSync(join(work, recordPath), decisionFileYaml({ ...published, work }, [acceptPurpose]) + "copy: *person\n");
      expectRefused(work, /^Decision file /);
    });
  });

  test("refuses a run whose published baseline changed after Stage 6", () => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      saveRecord(work, [acceptPurpose]);
      appendFileSync(join(work, published.baselinePath), "\n");
      expectRefused(work, `The registered file ${published.baselinePath} changed after it was saved: ` +
        "its SHA-256 is not the one in run.yaml.\n");
    });
  });

  test("refuses a run that Stage 6 did not complete", () => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      saveRecord(work, [acceptPurpose]);
      const manifest = parse(readFileSync(join(work, "run.yaml"), "utf8")) as Fields;
      writeFileSync(join(work, "run.yaml"), stringify({ ...manifest, status: "in-progress" }));
      expectRefused(work, "The run has no published baseline. Record decisions after Stage 6 publishes the baseline of the run.\n");
    });
  });

  test.each([[["next"]], [["next", "--run", "run"]], [["next", "--decisions", "decisions-001"]], [["next", "--run", "run", "--decisions"]],
    [["next", "--run", "--decisions", "decisions-001"]], [["next", "--run", "run", "--decisions", "decisions-001", "extra"]],
    [["next", "--run", "run", "--run", "other", "--decisions", "decisions-001"]],
    [["next", "--force", "--run", "run", "--decisions", "decisions-001"]]])(
    "prints the usage for the arguments %p", (args: string[]) => {
      const result = runCli(["baseline", ...args]);
      expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toEqual({ status: 1, stdout: "", stderr: usage });
    });
});
