import { describe, expect, test } from "bun:test";
import * as yaml from "yaml";
import { checkPinnedRuleList, readRuleList } from "../../src/behavior-entry-rules.ts";

// readRuleList reads the YAML of the pinned rule list: UTF-8 text with one document,
// unique keys and no aliases, then the check of the contract.
const rule = "  - id: express-route-get\n    version: 1\n    library: express\n    entryKind: http-route\n    kind: call\n" +
  "    importName: express\n    callPath: express().get\n    nameArgument: 0\n    handlerArgument: last\n";
const list = "# A comment.\nformatVersion: 1\nrules:\n" + rule;

describe("readRuleList", () => {
  test("reads a list that starts with a comment", () => {
    expect(readRuleList(Buffer.from(list), yaml).rules.map(({ id }) => id)).toEqual(["express-route-get"]);
  });

  test.each([
    ["bytes that are not UTF-8", Buffer.concat([Buffer.from(list), Buffer.from([0xe9])]),
      "The behavior entry rule list must use UTF-8."],
    ["a repeated key", Buffer.from(list + "    version: 2\n"), "The behavior entry rule list must contain valid YAML: Map keys must be unique"],
    ["a second document", Buffer.from(list + "---\nformatVersion: 1\n"), "The behavior entry rule list must contain valid YAML: "],
    ["an alias", Buffer.from("formatVersion: 1\nrules:\n  - &first\n    " + rule.slice(4) + "  - *first\n"), "Alias resolution is disabled"],
  ])("refuses %s", (_name, bytes, message) => {
    expect(() => readRuleList(bytes, yaml)).toThrow(message);
  });
});

test("checkPinnedRuleList refuses a checkout list that differs from the saved copy", () => {
  expect(() => checkPinnedRuleList(Buffer.from(list), Buffer.from(list))).not.toThrow();
  expect(() => checkPinnedRuleList(Buffer.from(list), Buffer.from(list + "# A later change.\n"))).toThrow(
    "The behavior entry rule list changed since Stage 4 start: packages/producer/rules/behavior-entry-rules.yaml. " +
    "Restore it or start a new attempt.");
});
