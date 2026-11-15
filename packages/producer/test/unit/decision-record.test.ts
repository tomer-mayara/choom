import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readCompletedRun } from "../../src/completed-run.ts";
import { decisionRecordPath, parseDecisionYaml, readDecisionRecord } from "../../src/decision-record.ts";
import { withScratch } from "../support/commands.ts";
import { smallRunBaselinePath, writeSmallCompletedRun } from "../support/completed-run.ts";

// A decision file is YAML, read with the producer's bounded YAML profile. The
// decide command reads a new decision file with it, and the reader of a saved
// decision record uses the same rules.
const digest = "0123456789abcdef".repeat(4);
const decisionYaml = `# Baseline baseline-check, SHA-256 ${digest}
formatVersion: 1
id: decisions-001
baselineRef: baseline-check
baselineDigest: ${digest}
decider:
  name: Ada Example
  kind: human
decidedAt: 2026-11-15T10:30:00Z
entries:
  - action: accept
    itemId: cli
    field: purpose
  - action: correct
    itemId: http
    field: purpose
    oldValue: Provide http
    newValue: Serve the saved orders.
`;
const decisions = { formatVersion: 1, id: "decisions-001", baselineRef: "baseline-check", baselineDigest: digest,
  decider: { name: "Ada Example", kind: "human" }, decidedAt: "2026-11-15T10:30:00Z",
  entries: [{ action: "accept", itemId: "cli", field: "purpose" },
    { action: "correct", itemId: "http", field: "purpose", oldValue: "Provide http", newValue: "Serve the saved orders." }] };
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const limit = 16 * 1024 * 1024;

describe("a decision file", () => {
  test("is YAML that can start with a comment, and its time stays text", () => {
    expect(parseDecisionYaml(Buffer.from(decisionYaml))).toEqual(decisions);
  });

  test("can also be JSON, which is YAML", () => {
    expect(parseDecisionYaml(Buffer.from(JSON.stringify(decisions, null, 2)))).toEqual(decisions);
  });

  test("keeps a merge key without an alias as an ordinary key, so nothing is merged", () => {
    expect(parseDecisionYaml(Buffer.from("<<: {kind: human}\nname: Ada Example\n"))).toEqual({ "<<": { kind: "human" },
      name: "Ada Example" });
  });

  test.each<[string, string | Buffer, string]>([
    ["YAML that is not valid", "id: [decisions-001\n", "Decision file must contain valid YAML."],
    ["a merge key with an alias", "person: &person {kind: human}\ndecider:\n  <<: *person\n",
      "Decision file YAML anchors and explicit tags are unsupported."],
    ["a custom tag", "id: !decision decisions-001\n", "Decision file YAML anchors and explicit tags are unsupported."],
    ["an alias", "decider: *person\n", "Decision file YAML aliases and syntax errors are unsupported."],
    ["a duplicate key", "id: decisions-001\nid: decisions-002\n", "Decision file YAML mapping keys must be unique strings."],
    ["two documents", "id: decisions-001\n---\nid: decisions-002\n", "Decision file must contain one YAML document."],
    ["a number that is not finite", "formatVersion: .inf\n", "Decision file must contain JSON-compatible data."],
    ["bytes that are not UTF-8", Buffer.from([0x69, 0x64, 0x3a, 0x20, 0xff, 0x0a]), "Decision file must use UTF-8."],
    ["more than 16 MiB", "#".repeat(limit + 1), "Decision file exceeds the 16 MiB file limit."],
  ])("is refused when it has %s", (_name, content, message) => {
    expect(() => parseDecisionYaml(Buffer.isBuffer(content) ? content : Buffer.from(content))).toThrow(new Error(message));
  });
});

describe("a saved decision record", () => {
  function runWith(scratch: string, records: Record<string, string> = {}) {
    const work = join(scratch, "run");
    writeSmallCompletedRun(work, [{ path: smallRunBaselinePath, text: "formatVersion: 1\n" }]);
    mkdirSync(join(work, "decisions"), { recursive: true });
    for (const [id, text] of Object.entries(records)) writeFileSync(join(work, decisionRecordPath(id)), text);
    return readCompletedRun(work);
  }

  test("is read from decisions/<id>.yaml with its bytes and SHA-256", () => {
    withScratch((scratch) => {
      const record = readDecisionRecord(runWith(scratch, { "decisions-001": decisionYaml }), "decisions-001");
      const bytes = Buffer.from(decisionYaml);
      expect(record).toEqual({ path: "decisions/decisions-001.yaml", bytes, sha256: sha256(bytes), value: decisions });
    });
  });

  test.each(["", "Decisions-001", "decisions/001", "../run", "decisions-001.yaml", "d".repeat(129)])(
    "is refused for the record ID %p", (id) => {
      withScratch((scratch) => {
        expect(() => readDecisionRecord(runWith(scratch), id)).toThrow(new Error(`Not a decision record ID: ${JSON.stringify(id)}.`));
      });
    });

  test.each(["missing", "a symbolic link"])("is refused when it is %s", (kind) => {
    withScratch((scratch) => {
      const run = runWith(scratch);
      if (kind !== "missing") {
        writeFileSync(join(scratch, "elsewhere.yaml"), decisionYaml);
        symlinkSync(join(scratch, "elsewhere.yaml"), join(run.folder, decisionRecordPath("decisions-002")));
      }
      expect(() => readDecisionRecord(run, "decisions-002")).toThrow(new Error("The run has no decision record decisions-002: " +
        "decisions/decisions-002.yaml is missing or is not a regular file."));
    });
  });

  test("is refused when it breaks the bounded YAML profile", () => {
    withScratch((scratch) => {
      const run = runWith(scratch, { "decisions-001": `${decisionYaml}id: decisions-002\n` });
      expect(() => readDecisionRecord(run, "decisions-001")).toThrow(new Error("Decision file YAML mapping keys must be unique strings."));
    });
  });

  test("is refused before it is read when it is larger than 16 MiB", () => {
    withScratch((scratch) => {
      const run = runWith(scratch, { "decisions-001": "#".repeat(limit + 1) });
      expect(() => readDecisionRecord(run, "decisions-001")).toThrow(new Error("Decision file exceeds the 16 MiB file limit."));
    });
  });
});
