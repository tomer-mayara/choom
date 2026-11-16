import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { behaviorEntryRulesPath } from "../../../src/behavior-entry-rules.ts";
import { behaviorEntryNotes } from "../../../src/stage-4-behavior-entries.ts";
import type { ExtraFile } from "../../fixtures/stage-4-publication/fixture.ts";
import { collectedAttempt } from "../../support/collected-attempt.ts";
import { toolsRoot } from "../../support/commands.ts";
import { rangeIn } from "../../support/source-ranges.ts";

// Stage 4 collect applies the pinned rule list that start saved to the source files of
// the graph scope; the rule-lists suite checks the saved copy and its pin. The fixture
// run has a Stage 1 review whose role record makes the test folder a test folder.
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

const collected = collectedAttempt(files);
const saved = (name: string): Json => collected.saved(name);

// A candidate of the express-route-get rule in a file of the fixture.
function route(text: string, path: string, call: string, values: Json): Json {
  return { ruleId: "express-route-get", ruleVersion: 1, entryKind: "http-route", found: "syntax-rule", role: "unknown",
    roleRef: null, path, sha256: sha256(text), range: rangeIn(text, call), expression: call, truncated: false, nameReason: null,
    handlerReason: null, ...values };
}

describe("Stage 4 start and collect", () => {
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
      .toBe(sha256(readFileSync(join(collected.attempt().attempt, "behavior-entry-candidates.json"))));
  });
});
