import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { behaviorEntryRulesPath } from "../../../src/behavior-entry-rules.ts";
import { behaviorEntryNotes } from "../../../src/stage-4-behavior-entries.ts";
import { type ExtraFile, inspectStageFour, type StageFourAttempt, stageFourAttempt }
  from "../../fixtures/stage-4-publication/fixture.ts";
import { makeScratch, removeScratch, runCli, toolsRoot } from "../../support/commands.ts";
import { stagedRun } from "../../support/staged-run.ts";
import { copyToolCheckout } from "../../support/tool-checkout.ts";
import { rangeIn } from "../../support/source-ranges.ts";

// Stage 4 start saves the pinned rule list of the tool checkout and its SHA-256, and
// collect applies it to the source files of the graph scope. The fixture run has a
// Stage 1 review whose role record makes the test folder a test folder.
type Json = Record<string, unknown>;

const id = "s4-check";
const sha256 = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const rulesFile = "behavior-entry-rules.yaml";
const server = "import express from 'express';\nimport { listOrders } from './orders';\n\n" +
  "const routeFor = (name: string) => '/' + name;\nexport const app = express();\napp.get('/orders', listOrders);\n" +
  "app.get(routeFor('order'), (request: unknown) => request);\nconst cache = new Map();\ncache.get('orders', listOrders);\n";
const orders = "export function listOrders() {\n  return 'orders';\n}\n";
const routes = "import { app } from '../src/server';\n\nfunction health() {\n  return 'ok';\n}\n\napp.get('/health', health);\n";
const files: ExtraFile[] = [{ path: "src/orders.ts", text: orders }, { path: "src/server.ts", text: server },
  { path: "test/routes.test.ts", text: routes }];

let fixture: StageFourAttempt;
const saved = (name: string): Json => JSON.parse(readFileSync(join(fixture.attempt, name), "utf8")) as Json;

beforeAll(() => {
  fixture = stageFourAttempt(files);
  const collect = inspectStageFour(fixture, ["collect"]);
  if (collect.status !== 0) throw new Error("Stage 4 collect failed: " + collect.stderr);
}, 120_000);

afterAll(() => rmSync(fixture.root, { recursive: true, force: true }));

// A candidate of the express-route-get rule in a file of the fixture.
function route(text: string, path: string, call: string, values: Json): Json {
  return { ruleId: "express-route-get", ruleVersion: 1, entryKind: "http-route", found: "syntax-rule", role: "unknown",
    roleRef: null, path, sha256: sha256(text), range: rangeIn(text, call), expression: call, truncated: false, nameReason: null,
    handlerReason: null, ...values };
}

describe("Stage 4 start and collect", () => {
  test("start saves the rule list of the tool checkout and records its SHA-256 with the other tool inputs", () => {
    const rules = readFileSync(join(toolsRoot, behaviorEntryRulesPath));
    expect(readFileSync(join(fixture.attempt, rulesFile)).equals(rules)).toBe(true);
    expect((saved("handoff.json").toolInputDigests as Json)[rulesFile]).toBe(sha256(rules));
    expect(Object.keys(saved("operator-start.json").digests as Json)).toContain(rulesFile);
  });

  test("collect saves each candidate of the rules with its rule, site, name, handler and role", () => {
    const { tool, outsideReads, notes, ...record } = saved("behavior-entry-candidates.json");
    const paths = ["cli.ts", "http.ts", "src/orders.ts", "src/server.ts", "test/routes.test.ts"];
    expect(record).toEqual({ formatVersion: 1, attemptId: id, snapshotRef: "snapshot-check", status: "completed",
      rulesRef: `${id}-file@${rulesFile}`, rulesSha256: sha256(readFileSync(join(toolsRoot, behaviorEntryRulesPath))),
      settingsRef: "settings-001", rolesRef: "review-001",
      scope: { files: paths, groups: [{ graphContext: "choom-default-v1-import", graphContextRef: `${id}-file@graph-profile.json#/contexts/0`,
        compilerSettingsRef: "settings-001#/parsingProfile", files: paths }] },
      queryOptions: { allowJs: true }, virtualRoot: "/repo", omittedCandidates: 0, gaps: [],
      candidates: [
        route(server, "src/server.ts", "app.get('/orders', listOrders)",
          { name: "/orders", handler: { path: "src/orders.ts", range: rangeIn(orders, orders.trimEnd()) } }),
        route(server, "src/server.ts", "app.get(routeFor('order'), (request: unknown) => request)", { name: null,
          nameReason: "The name argument is not a string literal, so the name is known only at run time.",
          handler: { path: "src/server.ts", range: rangeIn(server, "«(request: unknown) => request»)") } }),
        route(routes, "test/routes.test.ts", "app.get('/health', health)", { role: "test", roleRef: "review-001#/roles/0",
          name: "/health", handler: { path: "test/routes.test.ts", range: rangeIn(routes, "function health() {\n  return 'ok';\n}") } }),
      ] });
    expect({ name: (tool as Json).name, picomatch: (tool as Json).picomatch, notes }).toEqual({
      name: "ts-morph snapshot project (TypeScript type checker)", picomatch: "4.0.7", notes: behaviorEntryNotes });
    expect(outsideReads).toContainEqual({ operation: "directory-exists", path: "/repo/node_modules" });
  });

  test("collect records the digest of the candidates in its receipt", () => {
    expect((saved("operator-collect.json").digests as Json)["behavior-entry-candidates.json"])
      .toBe(sha256(readFileSync(join(fixture.attempt, "behavior-entry-candidates.json"))));
  });
});

describe("Stage 4 pinned rule list", () => {
  const changedMessage = "The behavior entry rule list changed since Stage 4 start: " + behaviorEntryRulesPath +
    ". Restore it or start a new attempt.";

  test("each later action refuses a tool checkout whose rule list changed after start, before it saves a receipt", () => {
    const scratch = makeScratch();
    const attempt = stageFourAttempt([], copyToolCheckout(scratch));
    try {
      appendFileSync(join(attempt.tools, behaviorEntryRulesPath), "# A later change.\n");
      const collect = inspectStageFour(attempt, ["collect"]);
      expect({ status: collect.status, stdout: collect.stdout }).toEqual({ status: 1, stdout: "" });
      expect(collect.stderr).toContain(changedMessage);
      expect(existsSync(join(attempt.attempt, "operator-collect.started.json"))).toBe(false);
      const graph = runCli(["stage-4", "run"], { CHOOM_TOOLS: attempt.tools, CHOOM_WORK: attempt.work, CHOOM_STAGE4_ID: id,
        CHOOM_STAGE4: attempt.attempt }, attempt.tools);
      expect({ status: graph.status, stdout: graph.stdout }).toEqual({ status: 1, stdout: "" });
      expect(graph.stderr).toContain(changedMessage);
    } finally {
      rmSync(attempt.root, { recursive: true, force: true });
      removeScratch(scratch);
    }
  }, 60_000);

  test("an excerpt after collect refuses a changed rule list", () => {
    const scratch = makeScratch();
    const attempt = stageFourAttempt([], copyToolCheckout(scratch));
    try {
      expect(inspectStageFour(attempt, ["collect"])).toMatchObject({ status: 0, stderr: "" });
      writeFileSync(join(attempt.tools, behaviorEntryRulesPath), "formatVersion: 1\nrules: []\n");
      const excerpt = inspectStageFour(attempt, ["excerpt", "cli.ts", "1", "1"]);
      expect(excerpt.status).toBe(1);
      expect(excerpt.stderr).toContain(changedMessage);
      expect(existsSync(join(attempt.attempt, "operator-excerpt-001.started.json"))).toBe(false);
    } finally {
      rmSync(attempt.root, { recursive: true, force: true });
      removeScratch(scratch);
    }
  }, 60_000);

  test("start refuses a rule list that does not follow the contract and creates no attempt", () => {
    const scratch = makeScratch();
    try {
      const tools = copyToolCheckout(scratch);
      const work = join(scratch, "run");
      stagedRun(work, 3, { tools });
      writeFileSync(join(tools, behaviorEntryRulesPath), "formatVersion: 2\nrules: []\n");
      const start = runCli(["stage-4", "start"], { CHOOM_TOOLS: tools, CHOOM_WORK: work, CHOOM_STAGE4_ID: id }, tools);
      expect({ status: start.status, stdout: start.stdout }).toEqual({ status: 1, stdout: "" });
      expect(start.stderr).toContain("Invalid behavior entry rule list: use formatVersion: 1 and a list of rules, with no other field.");
      expect(existsSync(join(work, "evidence", id))).toBe(false);
    } finally {
      removeScratch(scratch);
    }
  }, 60_000);
});
