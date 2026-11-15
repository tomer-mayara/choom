import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { appendFileSync, cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { type CommandResult, runCli, withScratch } from "../../support/commands.ts";
import { completedRun, type CompletedRunFixture, stageSixAttempt } from "../../support/completed-run.ts";
import { folderState } from "../../support/producer-record.ts";

// The baseline decide command on copies of one run that the Stage 6 command line
// completed. The command checks the decisions with @choom/baseline-model, so this
// is an integration suite. A fictional model made the readiness review of the run.
interface Entry { action: string; itemId: string; field: string; oldValue?: unknown; newValue?: unknown }

const model = "Fictional Model 7";
const callRecord = `evidence/${stageSixAttempt}/llm/analysis-call.yaml`;
const recordPath = "decisions/decisions-001.json";
const usage = "Use baseline decide --run RUN_FOLDER DECISION_FILE.\n";
const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
let published: CompletedRunFixture;

beforeAll(async () => {
  published = await completedRun(model);
}, 60_000);

afterAll(() => rmSync(published.root, { recursive: true, force: true }));

function copiedRun(scratch: string): string {
  const work = join(scratch, "run");
  cpSync(published.work, work, { recursive: true });
  return work;
}

function baselineDigest(work: string): string {
  return sha256(readFileSync(join(work, published.baselinePath)));
}

// Writes a decision file for the published baseline outside the run folder.
function decisionFile(scratch: string, work: string, entries: Entry[], change: Record<string, unknown> = {}): string {
  const path = join(scratch, "decisions.json");
  writeFileSync(path, JSON.stringify({ formatVersion: 1, id: "decisions-001", baselineRef: published.baselineId,
    baselineDigest: baselineDigest(work), decider: { name: "Ada Example", kind: "human" }, decidedAt: "2026-11-15T10:30:00Z",
    entries, ...change }, null, 2) + "\n");
  return path;
}

const decide = (work: string, file: string): CommandResult => runCli(["baseline", "decide", "--run", work, file]);
const acceptPurpose: Entry = { action: "accept", itemId: "cli", field: "purpose" };

// A refused command writes nothing in the run folder.
function expectRefused(work: string, file: string, stderr: string): void {
  const before = folderState(work);
  const result = decide(work, file);
  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toEqual({ status: 1, stdout: "", stderr });
  expect(folderState(work)).toEqual(before);
}

describe("baseline decide", () => {
  test("saves the decision file once by its ID, and names the decider, the time and each statement", () => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      const file = decisionFile(scratch, work, [acceptPurpose,
        { action: "correct", itemId: "mcp", field: "groupingReason", oldValue: "One reviewed boundary.", newValue: "The MCP tool." }]);
      const before = folderState(work);
      const result = decide(work, file);
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
      const bytes = readFileSync(file);
      expect(JSON.parse(result.stdout)).toEqual({
        status: "decisions-recorded", id: "decisions-001", path: recordPath, sha256: sha256(bytes),
        baselineRef: published.baselineId, baselineDigest: baselineDigest(work),
        decider: { name: "Ada Example", kind: "human" }, decidedAt: "2026-11-15T10:30:00Z",
        statements: [{ action: "accept", statement: "cli.purpose" }, { action: "correct", statement: "mcp.groupingReason" }],
        deciderCheck: { llmCallRecords: [callRecord], models: [model] },
        limits: [expect.stringContaining("process rule"), expect.stringContaining("does not change")],
        writes: [recordPath],
      });
      expect(readFileSync(join(work, recordPath))).toEqual(bytes);
      const isRecord = ([path]: [string, string]): boolean => path === "decisions" || path.startsWith("decisions/");
      const after = folderState(work);
      expect(after.filter((entry) => !isRecord(entry))).toEqual(before);
      expect(after.filter(isRecord)).toEqual([["decisions", "folder"], [recordPath, sha256(bytes)]]);
    });
  });

  test("refuses a second save with the same ID, also with the same content, and keeps the first record", () => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      const file = decisionFile(scratch, work, [acceptPurpose]);
      expect(decide(work, file).status).toBe(0);
      const saved = readFileSync(join(work, recordPath));
      const refusal = `The decision record decisions-001 is saved already: ${recordPath}. A saved decision record does not ` +
        "change. Give new decisions a new ID.\n";
      expectRefused(work, file, refusal);
      expectRefused(work, decisionFile(scratch, work, [{ action: "accept", itemId: "mcp", field: "purpose" }]), refusal);
      expect(readFileSync(join(work, recordPath))).toEqual(saved);
    });
  });

  test("refuses a decider that is the model of the run, and writes nothing", () => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      const file = decisionFile(scratch, work, [acceptPurpose], { decider: { name: " fictional model 7", kind: "human" } });
      expectRefused(work, file, "The decisions are refused:\n- The decider \" fictional model 7\" is the model " +
        `"${model}" of the LLM call record ${callRecord}. A model cannot accept or correct statements. ` +
        "Name the person who made the decisions.\n");
    });
  });

  test("refuses decisions that do not fit the published baseline, with every problem", () => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      const file = decisionFile(scratch, work, [{ action: "accept", itemId: "billing", field: "purpose" },
        { action: "correct", itemId: "http", field: "purpose", oldValue: "Provide the orders", newValue: "Bill the orders" }]);
      expectRefused(work, file, "The decisions are refused:\n" +
        `- entries.0: billing.purpose is not a statement of baseline ${published.baselineId}.\n` +
        '- entries.1: the old value of http.purpose is not the current value. Expected oldValue: "Provide http". ' +
        'Given oldValue: "Provide the orders".\n');
    });
  });

  test("refuses decisions when the published baseline changed after Stage 6", () => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      const file = decisionFile(scratch, work, [acceptPurpose]);
      appendFileSync(join(work, published.baselinePath), "\n");
      expectRefused(work, file, `The registered file ${published.baselinePath} changed after it was saved: ` +
        "its SHA-256 is not the one in run.yaml.\n");
    });
  });

  test("refuses a run that Stage 6 did not complete", () => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      const manifest = parse(readFileSync(join(work, "run.yaml"), "utf8")) as Record<string, unknown>;
      writeFileSync(join(work, "run.yaml"), stringify({ ...manifest, status: "in-progress" }));
      expectRefused(work, decisionFile(scratch, work, [acceptPurpose]),
        "The run has no published baseline. Record decisions after Stage 6 publishes the baseline of the run.\n");
    });
  });

  test("refuses a decision file in the run folder", () => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      const inside = join(work, "decisions.json");
      writeFileSync(inside, readFileSync(decisionFile(scratch, work, [acceptPurpose])));
      expectRefused(work, inside, "Keep the decision file outside the run folder. The command saves its copy in decisions/.\n");
    });
  });

  test.each([
    ["not JSON", "{ formatVersion: 1 }\n", /^The decision file is not valid JSON: /],
    ["not UTF-8 text", Buffer.from([0x7b, 0xff, 0x7d]), /^The decision file is not UTF-8 text\.\n$/],
    ["larger than 16 MiB", " ".repeat(16 * 1024 * 1024 + 1), /^The decision file is larger than 16 MiB\.\n$/],
  ])("refuses a decision file that is %s", (_name, content, stderr) => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      const file = join(scratch, "decisions.json");
      writeFileSync(file, content);
      const before = folderState(work);
      const result = decide(work, file);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(stderr);
      expect(folderState(work)).toEqual(before);
    });
  });

  test("refuses a decisions path in the run folder that is not a folder", () => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      writeFileSync(join(work, "decisions"), "");
      expectRefused(work, decisionFile(scratch, work, [acceptPurpose]), "decisions in the run folder is not a folder.\n");
    });
  });

  test.each([[[]], [["decide"]], [["decide", "--run"]], [["decide", "--run", "run"]], [["decide", "file.json"]],
    [["decide", "--run", "run", "a.json", "b.json"]], [["decide", "--force", "--run", "run", "a.json"]], [["accept", "a.json"]]])(
    "prints the usage for the arguments %p", (args: string[]) => {
      const result = runCli(["baseline", ...args]);
      expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toEqual({ status: 1, stdout: "", stderr: usage });
    });
});
