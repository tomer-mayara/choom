import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { type CommandResult, runCli, withScratch } from "../../support/commands.ts";
import { completedRun, type CompletedRunFixture, copyRunFolder, type DecisionEntry as Entry, type DecisionFile, decisionFileYaml,
  llmCallRecord, smallRunBaselinePath, stageSixAttempt, writeSmallCompletedRun } from "../../support/completed-run.ts";
import { folderState } from "../../support/producer-record.ts";

// The baseline decide command on copies of one run that the Stage 6 command line
// completed. The command checks the decisions with @choom/baseline-model, so this
// is an integration suite. A fictional model made the readiness review of the run.

const model = "Fictional Model 7";
const callRecord = `evidence/${stageSixAttempt}/llm/analysis-call.yaml`;
const recordPath = "decisions/decisions-001.yaml";
const usage = "Use baseline decide --run RUN_FOLDER DECISION_FILE, or baseline next --run RUN_FOLDER --decisions DECISION_ID.\n";
const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
let published: CompletedRunFixture;

beforeAll(async () => {
  published = await completedRun(model);
}, 60_000);

afterAll(() => rmSync(published.root, { recursive: true, force: true }));

const copiedRun = (scratch: string): string => copyRunFolder(published, scratch);

function baselineDigest(work: string): string {
  return sha256(readFileSync(join(work, published.baselinePath)));
}

// The YAML text of a decision file for the published baseline in the run copy `work`.
const decisionYaml = (work: string, entries: Entry[], change: Partial<DecisionFile> = {}): string =>
  decisionFileYaml({ ...published, work }, entries, change);

// Writes a decision file outside the run folder.
function decisionFile(scratch: string, work: string, entries: Entry[], change: Partial<DecisionFile> = {}): string {
  const path = join(scratch, "decisions.yaml");
  writeFileSync(path, decisionYaml(work, entries, change));
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
      const inside = join(work, "decisions.yaml");
      writeFileSync(inside, readFileSync(decisionFile(scratch, work, [acceptPurpose])));
      expectRefused(work, inside, "Keep the decision file outside the run folder. The command saves its copy in decisions/.\n");
    });
  });

  // The decision file is read with the producer's bounded YAML profile, as a baseline is.
  test.each<[string, (work: string) => string | Buffer, string]>([
    ["YAML that is not valid", () => "id: [decisions-001\n", "Decision file must contain valid YAML.\n"],
    ["a merge key with an alias", (work) => decisionYaml(work, [acceptPurpose]) + "person: &person {kind: human}\nother:\n  <<: *person\n",
      "Decision file YAML anchors and explicit tags are unsupported.\n"],
    ["a custom tag", (work) => decisionYaml(work, [acceptPurpose]).replace("id: decisions-001", "id: !decision decisions-001"),
      "Decision file YAML anchors and explicit tags are unsupported.\n"],
    ["an alias", (work) => decisionYaml(work, [acceptPurpose]) + "copy: *person\n",
      "Decision file YAML aliases and syntax errors are unsupported.\n"],
    ["a duplicate key", (work) => decisionYaml(work, [acceptPurpose]) + "id: decisions-002\n",
      "Decision file YAML mapping keys must be unique strings.\n"],
    ["bytes that are not UTF-8", () => Buffer.from([0x69, 0x64, 0x3a, 0x20, 0xff, 0x0a]), "Decision file must use UTF-8.\n"],
    ["more than 16 MiB", () => " ".repeat(16 * 1024 * 1024 + 1), "Decision file exceeds the 16 MiB file limit.\n"],
  ])("refuses a decision file with %s, and writes nothing", (_name, content, stderr) => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      const file = join(scratch, "decisions.yaml");
      writeFileSync(file, content(work));
      expectRefused(work, file, stderr);
    });
  });

  test("does not merge a merge key without an alias: the contract refuses it as an unknown key", () => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      const file = join(scratch, "decisions.yaml");
      writeFileSync(file, decisionYaml(work, [acceptPurpose]) + "<<: {id: decisions-002}\n");
      expectRefused(work, file, 'The decisions are refused:\n- The decision file is invalid: Unrecognized key: "<<"\n');
    });
  });

  test("refuses a decision file that is a folder", () => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      expectRefused(work, scratch, `The decision file is not a regular file: ${scratch}\n`);
    });
  });

  test("refuses a published baseline that the shared baseline rules refuse, and names the first rule", () => {
    withScratch((scratch) => {
      const work = copiedRun(scratch);
      const file = decisionFile(scratch, work, [acceptPurpose]);
      const baseline = parse(readFileSync(join(work, published.baselinePath), "utf8")) as Record<string, unknown>;
      const text = stringify({ ...baseline, rules: undefined });
      writeFileSync(join(work, published.baselinePath), text);
      const manifest = parse(readFileSync(join(work, "run.yaml"), "utf8")) as { artifacts: Record<string, { sha256: string }> };
      Object.assign(manifest.artifacts[published.baselineId] ?? {}, { sha256: sha256(text) });
      writeFileSync(join(work, "run.yaml"), stringify(manifest));
      expectRefused(work, file, `The published baseline ${published.baselinePath} does not pass the shared baseline rules ` +
        "at rules: Invalid input: expected array, received undefined\n");
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

// baseline decide runs the checks of the next version that baseline next makes from
// the saved record: the shared rules and the producer profile of a next version.
// Each case is a small completed run whose published baseline the shared rules
// accept, and decisions that the shared decision rules accept, but whose next
// version the producer profile refuses. baseline next would refuse the saved
// record, and its ID could not be used again.
type Fields = Record<string, unknown>;
const proposed = (value: unknown): Fields => ({ value, status: "proposed", evidenceRefs: ["launch"] });
const component = (id: string, membership: Fields, parent?: string | null): Fields => ({ id, name: id,
  purpose: proposed(`Own the ${id} code.`), membership: proposed(membership), groupingReason: proposed("Reviewed source."),
  ...(parent === undefined ? {} : { parent: proposed(parent) }) });
const smallBaseline = (formatVersion: number, components: Fields[], rules: Fields[] = []): Fields =>
  ({ formatVersion, id: "baseline-check", parentId: null, components, interfaces: [], resources: [], rules });
const sharedSymbol = { path: "src/shared.ts", symbol: "computePrice" };
// 17 components: c1 to c15 form a chain of 16 levels below c0, and c16 has no parent.
const chain = Array.from({ length: 17 }, (_, index) => component(`c${index}`, { paths: [`src/c${index}/**`] },
  index === 0 ? undefined : index === 16 ? null : `c${index - 1}`));

const nextVersionCases: [string, Fields, Entry[], string][] = [
  ["a correction that gives one symbol two owners",
    smallBaseline(5, [component("billing", { paths: ["src/billing/**"], symbols: [sharedSymbol] }),
      component("pricing", { paths: ["src/pricing/**"] })]),
    [{ action: "correct", itemId: "pricing", field: "membership", oldValue: { paths: ["src/pricing/**"] },
      newValue: { paths: ["src/pricing/**"], symbols: [sharedSymbol] } }],
    "The symbol computePrice of src/shared.ts has two owners: billing and pricing. A symbol has one direct owner."],
  ["a correction that makes 17 component levels", smallBaseline(1, chain),
    [{ action: "correct", itemId: "c16", field: "parent", oldValue: null, newValue: "c15" }],
    "Baseline exceeds the 16-parent-level display limit."],
  ["a record ID that gives the version the ID of an item",
    smallBaseline(1, [component("cli", { paths: ["cli.ts"] })], [{ id: "baseline-check-decisions-001", name: "Rule",
      subject: proposed({ path: "cli.ts" }), expected: proposed({ owner: "cli" }), check: proposed({ review: "source" }) }]),
    [{ action: "accept", itemId: "cli", field: "purpose" }],
    "The ID baseline-check-decisions-001 of the version is also the ID of the rule baseline-check-decisions-001. " +
      "The baseline ID is reserved. Use another decision record ID."],
];

describe("baseline decide with the checks of the next version", () => {
  test.each(nextVersionCases)("refuses %s with the message of baseline next, and writes nothing", (_name, baseline, entries, problem) => {
    withScratch((scratch) => {
      const work = join(scratch, "run");
      const text = stringify(baseline);
      writeSmallCompletedRun(work, [{ path: smallRunBaselinePath, text }, { path: "evidence/llm-call.yaml", text: llmCallRecord(model) }]);
      const file = join(scratch, "decisions.yaml");
      writeFileSync(file, stringify({ formatVersion: 1, id: "decisions-001", baselineRef: "baseline-check", baselineDigest: sha256(text),
        decider: { name: "Ada Example", kind: "human" }, decidedAt: "2026-11-15T10:30:00Z", entries }));
      expectRefused(work, file, `The decisions are refused:\n- ${problem}\n`);
    });
  });
});
