import { describe, expect, test } from "bun:test";
import type { ExtraFile } from "../../fixtures/stage-4-publication/fixture.ts";
import { collectedAttempt } from "../../support/collected-attempt.ts";

// Stage 4 collect reads the scope of its two rule records, the behavior entry
// candidates and the resource access candidates, group by group: each graph group of
// the scope opens its own snapshot project. Here tsconfig.json selects src/a.ts and
// src/c.ts, and src/b.ts is in the configuration-free fallback group with the files of
// the fixture, which comes first. Each of the three files has one route and one Knex
// query whose names are the path of the file.
type Json = Record<string, unknown>;

const source = (path: string): ExtraFile => ({ path, text: "import express from 'express';\nimport knex from 'knex';\n\n" +
  `const app = express();\nconst db = knex({ client: 'pg' });\napp.get('${path}', () => db('${path}').select('id'));\n` });
const tsconfig = { path: "tsconfig.json", text: JSON.stringify({ files: ["src/a.ts", "src/c.ts"] }) + "\n" };
const collected = collectedAttempt([source("src/a.ts"), source("src/b.ts"), source("src/c.ts"), tsconfig], [], "collected");

// The path, the rule and the name of each candidate of a record, in the order of the record.
const candidatesOf = (name: string): unknown[] => (collected.saved(name).candidates as Json[])
  .map(({ path, ruleId, name: found }) => [path, ruleId, found]);

describe("the Stage 4 rule records", () => {
  test("read the graph groups of the scope in the order of their first file", () => {
    const scope = collected.saved("behavior-entry-candidates.json").scope as { files: string[]; groups: Json[] };
    expect({ files: scope.files, groups: scope.groups.map(({ graphContext, files }) => [graphContext, files]) }).toEqual({
      files: ["cli.ts", "http.ts", "src/a.ts", "src/b.ts", "src/c.ts"],
      groups: [["fallback-import", ["cli.ts", "http.ts", "src/b.ts"]], ["compiler-1-import", ["src/a.ts", "src/c.ts"]]] });
  });

  test("list the candidates in the order of the scope files, not in the order of the groups", () => {
    const paths = ["src/a.ts", "src/b.ts", "src/c.ts"];
    expect(candidatesOf("behavior-entry-candidates.json")).toEqual(paths.map((path) => [path, "express-route-get", path]));
    expect(candidatesOf("resource-access-candidates.json")).toEqual(paths.map((path) => [path, "knex-select", path]));
  });
});
