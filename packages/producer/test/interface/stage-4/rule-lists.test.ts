import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stageFourRuleLists } from "../../../src/stage-4-rule-lists.ts";
import { inspectStageFour, type StageFourAttempt, stageFourAttempt } from "../../fixtures/stage-4-publication/fixture.ts";
import { makeScratch, removeScratch, runCli, toolsRoot } from "../../support/commands.ts";
import { stagedRun } from "../../support/staged-run.ts";
import { copyToolCheckout } from "../../support/tool-checkout.ts";

// Stage 4 start checks each pinned rule list of the tool checkout against its
// contract, saves a copy in the attempt and records its SHA-256 with the other tool
// inputs. Each later Stage 4 action refuses a tool checkout whose list changed after
// start, before it saves a receipt. The suite runs these checks for each list.
type Json = Record<string, unknown>;

const id = "s4-check";
const sha256 = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const lists = stageFourRuleLists.map((list) => [list.label, list] as const);

let started: StageFourAttempt;
const saved = (name: string): Json => JSON.parse(readFileSync(join(started.attempt, name), "utf8")) as Json;

beforeAll(() => {
  started = stageFourAttempt([]);
}, 120_000);

afterAll(() => rmSync(started.root, { recursive: true, force: true }));

// Runs `use` on a Stage 4 attempt whose tool checkout is a copy, and removes both.
function withCopiedTools(use: (attempt: StageFourAttempt) => void): void {
  const scratch = makeScratch();
  const attempt = stageFourAttempt([], copyToolCheckout(scratch));
  try {
    use(attempt);
  } finally {
    rmSync(attempt.root, { recursive: true, force: true });
    removeScratch(scratch);
  }
}

describe.each(lists)("Stage 4 and the %s rule list", (_label, list) => {
  const changedMessage = `The ${list.label} rule list changed since Stage 4 start: ${list.path}. Restore it or start a new attempt.`;

  test("start saves the list of the tool checkout and records its SHA-256 with the other tool inputs", () => {
    const rules = readFileSync(join(toolsRoot, list.path));
    expect(readFileSync(join(started.attempt, list.file)).equals(rules)).toBe(true);
    expect((saved("handoff.json").toolInputDigests as Json)[list.file]).toBe(sha256(rules));
    expect(Object.keys(saved("operator-start.json").digests as Json)).toContain(list.file);
  });

  test("each later action refuses a tool checkout whose list changed after start, before it saves a receipt", () => {
    withCopiedTools((attempt) => {
      appendFileSync(join(attempt.tools, list.path), "# A later change.\n");
      const collect = inspectStageFour(attempt, ["collect"]);
      expect({ status: collect.status, stdout: collect.stdout }).toEqual({ status: 1, stdout: "" });
      expect(collect.stderr).toContain(changedMessage);
      expect(existsSync(join(attempt.attempt, "operator-collect.started.json"))).toBe(false);
      const graph = runCli(["stage-4", "run"], { CHOOM_TOOLS: attempt.tools, CHOOM_WORK: attempt.work, CHOOM_STAGE4_ID: id,
        CHOOM_STAGE4: attempt.attempt }, attempt.tools);
      expect({ status: graph.status, stdout: graph.stdout }).toEqual({ status: 1, stdout: "" });
      expect(graph.stderr).toContain(changedMessage);
    });
  }, 60_000);

  test("an excerpt after collect refuses a changed list", () => {
    withCopiedTools((attempt) => {
      expect(inspectStageFour(attempt, ["collect"])).toMatchObject({ status: 0, stderr: "" });
      writeFileSync(join(attempt.tools, list.path), "formatVersion: 1\nrules: []\n");
      const excerpt = inspectStageFour(attempt, ["excerpt", "cli.ts", "1", "1"]);
      expect(excerpt.status).toBe(1);
      expect(excerpt.stderr).toContain(changedMessage);
      expect(existsSync(join(attempt.attempt, "operator-excerpt-001.started.json"))).toBe(false);
    });
  }, 60_000);

  test("start refuses a list that does not follow the contract and creates no attempt", () => {
    const scratch = makeScratch();
    try {
      const tools = copyToolCheckout(scratch);
      const work = join(scratch, "run");
      stagedRun(work, 3, { tools });
      writeFileSync(join(tools, list.path), "formatVersion: 2\nrules: []\n");
      const start = runCli(["stage-4", "start"], { CHOOM_TOOLS: tools, CHOOM_WORK: work, CHOOM_STAGE4_ID: id }, tools);
      expect({ status: start.status, stdout: start.stdout }).toEqual({ status: 1, stdout: "" });
      expect(start.stderr).toContain(`Invalid ${list.label} rule list: use formatVersion: 1 and a list of rules, with no other field.`);
      expect(existsSync(join(work, "evidence", id))).toBe(false);
    } finally {
      removeScratch(scratch);
    }
  }, 60_000);
});
