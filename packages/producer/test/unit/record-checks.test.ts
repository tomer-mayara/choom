import { describe, expect, test } from "bun:test";
import { parse } from "yaml";
import { evidenceBase, type EvidenceTarget, type PointerMessages, resolveEvidence, savedDocument }
  from "../../src/record-checks.ts";

// The evidence reference resolver that every stage uses: an ID, then optionally #
// and a JSON Pointer. Each stage gives the words of its own messages.
const messages: PointerMessages = { invalid: "Invalid: ", escape: "Escape: ", index: "Index: ", unresolved: "Unresolved: " };
const inventory = { files: [{ path: "a/b.ts", "x~y": 1 }], "a/b": true };
const file = (path: string, value: unknown = inventory): EvidenceTarget =>
  ({ path, document: () => savedDocument(path, JSON.stringify(value), parse) });
const source = { id: "s1-source-001", lines: [1, 2] };

describe("evidenceBase", () => {
  test("is the text before the first #", () => {
    expect(["inventory-001", "inventory-001#", "inventory-001#/files/0", "a#b#c"].map(evidenceBase))
      .toEqual(["inventory-001", "inventory-001", "inventory-001", "a"]);
  });
});

describe("resolveEvidence", () => {
  test.each<[string, string, EvidenceTarget, unknown]>([
    ["a source record without a pointer", "s1-source-001", { record: source }, source],
    ["a file without a pointer", "inventory-001", file("evidence/inventory.json"), undefined],
    ["the whole JSON document", "inventory-001#", file("evidence/inventory.json"), inventory],
    ["a list item of a JSON document", "inventory-001#/files/0/path", file("evidence/inventory.json"), "a/b.ts"],
    ["a key with the escapes ~0 and ~1", "inventory-001#/a~1b", file("evidence/inventory.json"), true],
    ["a key with an escaped tilde", "inventory-001#/files/0/x~0y", file("evidence/inventory.json"), 1],
    ["a percent-encoded pointer", "inventory-001#%2Ffiles%2F0%2Fpath", file("evidence/inventory.json"), "a/b.ts"],
    ["a YAML document", "review-001#/files/0/path", file("evidence/review.yaml"), "a/b.ts"],
    ["a YML document", "review-001#/files/0/path", file("evidence/review.yml"), "a/b.ts"],
    ["a field of a source record", "s1-source-001#/lines/1", { record: source }, 2],
    ["a whole text file, which is not read", "notes#", file("notes.txt", "not read"), undefined],
  ])("resolves %s", (_name, ref, target, value) => {
    expect(resolveEvidence(ref, target, messages)).toEqual(value);
  });

  test.each<[string, string, EvidenceTarget, string]>([
    ["a pointer that is not a path", "inventory-001#files", file("evidence/inventory.json"), "Invalid: inventory-001#files"],
    ["an escape other than ~0 and ~1", "inventory-001#/files~2", file("evidence/inventory.json"), "Escape: inventory-001#/files~2"],
    ["a tilde at the end", "inventory-001#/files~", file("evidence/inventory.json"), "Escape: inventory-001#/files~"],
    ["a list index with a leading zero", "inventory-001#/files/00", file("evidence/inventory.json"), "Index: inventory-001#/files/00"],
    ["the length of a list", "inventory-001#/files/length", file("evidence/inventory.json"), "Index: inventory-001#/files/length"],
    ["a list index after the end", "inventory-001#/files/1", file("evidence/inventory.json"), "Unresolved: inventory-001#/files/1"],
    ["a missing key", "inventory-001#/missing", file("evidence/inventory.json"), "Unresolved: inventory-001#/missing"],
    ["a step into a text value", "inventory-001#/files/0/path/0", file("evidence/inventory.json"),
      "Unresolved: inventory-001#/files/0/path/0"],
    ["a pointer into a text file", "notes#/0", file("notes.txt"), "Only a .json, .yaml or .yml file can take a JSON Pointer: notes#/0"],
    ["a pointer into a JSON Lines file", "search#/0", file("search.stdout.jsonl"),
      "Only a .json, .yaml or .yml file can take a JSON Pointer: search#/0"],
  ])("refuses %s", (_name, ref, target, message) => {
    expect(() => resolveEvidence(ref, target, messages)).toThrow(new Error(message));
  });
});

describe("savedDocument", () => {
  test("reads JSON for .json and YAML for .yaml and .yml", () => {
    expect([savedDocument("a.json", '{"a": 1}', parse), savedDocument("a.yaml", "a: 1\n", parse),
      savedDocument("a.yml", "a: 1\n", parse)]).toEqual([{ a: 1 }, { a: 1 }, { a: 1 }]);
  });

  test("refuses another file", () => {
    expect(() => savedDocument("evidence/notes.txt", "a: 1\n", parse)).toThrow(new Error("Not a JSON or YAML file: evidence/notes.txt"));
  });
});
