import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import * as tsMorph from "ts-morph";
import { binCandidates, binSnapshot, packageFiles } from "../../src/behavior-entry-bins.ts";
import type { BehaviorEntryPackageBinRule } from "../../src/generated/contracts.ts";
import { withScratch } from "../support/commands.ts";
import { type Files, snapshotOf } from "../support/snapshot-files.ts";
import { rangeIn } from "../support/source-ranges.ts";

// binCandidates on a saved snapshot: the commands that the bin field of a package.json
// names. Each path is a candidate at its value. Its handler is the file that the command
// runs, as the whole file, only with evidence: the snapshot holds the bin file, or a
// fully parsed configuration of the settings record compiles a source file of the
// snapshot to it. This rule is test data; behavior-entry-bin-samples.test.ts checks the
// rule of the pinned list.
type Json = Record<string, unknown>;
// The findings as the record saves them, as JSON values.
interface Findings { candidates: Json[]; gaps: Json[] }
const rule: BehaviorEntryPackageBinRule = { id: "package-bin", version: 1, library: "npm", entryKind: "cli-bin",
  kind: "package-bin" };
const json = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";
const cli = "#!/usr/bin/env node\nconsole.log('run');\n";
const source = "export function main() {\n  return 'run';\n}\nmain();\n";
// A fully parsed configuration that compiles the src folder to the dist folder.
const config = (values: Json = {}): Json => ({ path: "/repo/tsconfig.json", status: "parsed", diagnostics: [],
  compilerOptions: { outDir: "/repo/dist", rootDir: "/repo/src" }, fileNames: ["src/cli.ts", "src/tool.mts"], ...values });
const unlinked = (binFile: string): string => `The snapshot does not hold the bin file ${binFile}, and no fully parsed ` +
  "configuration of settings-001 with outDir and rootDir compiles a source file of the snapshot to it.";

// The findings of the rule in a package.json of the snapshot. `bytes` replaces the saved bytes of files, with their inventory.
function findingsIn(files: Files, path = "package.json", configs: Json[] = [config()], bytes: Record<string, Buffer> = {}):
  Findings {
  return withScratch((scratch) => {
    const snapshot = snapshotOf(scratch, files);
    for (const [name, saved] of Object.entries(bytes)) writeFileSync(join(snapshot.snapshotRoot, name), saved);
    const inventory = snapshot.files.map((file) => bytes[file.path] === undefined ? file
      : { ...file, bytes: bytes[file.path]?.length ?? 0, sha256: createHash("sha256").update(bytes[file.path] ?? "").digest("hex") });
    return binCandidates(binSnapshot({ ...snapshot, files: inventory }, tsMorph, { snapshotId: "snap", configs }, "settings-001"),
      path, [rule]) as unknown as Findings;
  });
}
// Bytes that are not UTF-8 text.
const notText = Buffer.from([0xff, 0xfe, 0x00]);

// The candidate of a command at the value that « and » mark in the package text.
function binAt(text: string, marked: string, name: string | null, handler: Json | null, handlerReason: string | null = null): Json {
  const expression = marked.slice(marked.indexOf("«") + 1, marked.indexOf("»"));
  return { ruleId: "package-bin", ruleVersion: 1, entryKind: "cli-bin", range: rangeIn(text, marked), expression, truncated: false,
    name, nameReason: null, handler, handlerReason };
}

// The handler of a linked file: the whole file, with the evidence.
const fileOf = (path: string, text: string, evidence: Json): Json => ({ path, range: rangeIn(text, text), evidence });
const compiled = (binFile: string, compilerSettingsRef = "settings-001#/configs/0"): Json =>
  ({ kind: "compiler-output", binFile, compilerSettingsRef, outDir: "dist", rootDir: "src" });

describe("binCandidates gives each command of the bin field with its name and the range of its value", () => {
  test("an object of commands, with the file that each command runs or the reason that no evidence names it", () => {
    const text = json({ name: "tools", bin: { run: "bin/cli.js", tool: "./dist/cli.js", other: "./build/cli.js" } });
    expect(findingsIn({ "package.json": text, "bin/cli.js": cli, "src/cli.ts": source })).toEqual({ gaps: [], candidates: [
      binAt(text, "\"run\": «\"bin/cli.js\"»", "run", fileOf("bin/cli.js", cli, { kind: "snapshot-file", binFile: "bin/cli.js" })),
      binAt(text, "\"tool\": «\"./dist/cli.js\"»", "tool", fileOf("src/cli.ts", source, compiled("dist/cli.js"))),
      binAt(text, "\"other\": «\"./build/cli.js\"»", "other", null, unlinked("build/cli.js"))] });
  });

  test.each([
    ["the package name", "tools", "tools"],
    ["the package name without its scope", "@acme/tools", "tools"],
  ])("one path names the command of %s", (_name, packageName, name) => {
    const text = json({ name: packageName, bin: "./bin/cli.js" });
    expect(findingsIn({ "package.json": text, "bin/cli.js": cli }).candidates).toEqual([binAt(text, "\"bin\": «\"./bin/cli.js\"»",
      name, fileOf("bin/cli.js", cli, { kind: "snapshot-file", binFile: "bin/cli.js" }))]);
  });

  // npm-normalize-package-bin, which bin-links of npm uses, names the command of each path of an array by its basename.
  test("an array of paths names the command of each path by its file name, with its extension, as npm does", () => {
    const text = json({ name: "tools", bin: ["bin/cli.js", "./tools/check"] });
    expect(findingsIn({ "package.json": text, "bin/cli.js": cli })).toEqual({ gaps: [], candidates: [
      binAt(text, "«\"bin/cli.js\"»", "cli.js", fileOf("bin/cli.js", cli, { kind: "snapshot-file", binFile: "bin/cli.js" })),
      binAt(text, "«\"./tools/check\"»", "check", null, unlinked("tools/check"))] });
  });

  test("one path without a package name has a null name with a reason", () => {
    const text = json({ bin: "./bin/cli.js" });
    expect(findingsIn({ "package.json": text, "bin/cli.js": cli }).candidates).toEqual([{
      ...binAt(text, "\"bin\": «\"./bin/cli.js\"»", null, fileOf("bin/cli.js", cli, { kind: "snapshot-file", binFile: "bin/cli.js" })),
      nameReason: "The bin field is one path and the package has no name, so npm installs no command for it." }]);
  });

  test("a command name and a path as npm reads them: the last part of the name, and a path in the folder of the package", () => {
    const text = json({ bin: { "@acme/run": "../cli.js", "other:check": "\\bin\\check.js" } });
    const check = "#!/usr/bin/env node\n";
    expect(findingsIn({ "tools/package.json": text, "tools/cli.js": cli, "tools/bin/check.js": check }, "tools/package.json")
      .candidates).toEqual([
      binAt(text, "\"@acme/run\": «\"../cli.js\"»", "run",
        fileOf("tools/cli.js", cli, { kind: "snapshot-file", binFile: "tools/cli.js" })),
      binAt(text, "\"other:check\": «\"\\\\bin\\\\check.js\"»", "check",
        fileOf("tools/bin/check.js", check, { kind: "snapshot-file", binFile: "tools/bin/check.js" }))]);
  });

  test("the last command of a name, as JSON.parse keeps it", () => {
    const text = "{\n  \"bin\": {\n    \"run\": \"./first.js\",\n    \"run\": \"./bin/cli.js\"\n  }\n}\n";
    expect(findingsIn({ "package.json": text, "bin/cli.js": cli }).candidates.map(({ name, expression }) => ({ name, expression })))
      .toEqual([{ name: "run", expression: "\"./bin/cli.js\"" }]);
  });
});

describe("binCandidates names the file that a command runs only with evidence", () => {
  const binText = json({ bin: { tool: "./dist/cli.js" } });
  const handlerOf = (files: Files, configs?: Json[]) => {
    const [found] = findingsIn({ "package.json": binText, ...files }, "package.json", configs).candidates;
    return { handler: found?.handler, handlerReason: found?.handlerReason };
  };

  test("a source file with the output name and a source extension of the output extension", () => {
    const text = json({ bin: { tool: "./dist/tool.mjs" } });
    const [found] = findingsIn({ "package.json": text, "src/tool.mts": source, "src/tool.ts": source }).candidates;
    expect(found?.handler).toEqual(fileOf("src/tool.mts", source, compiled("dist/tool.mjs")));
  });

  test("the first configuration of the settings record that compiles a source file to the bin file", () => {
    const other = config({ path: "/repo/tsconfig.build.json", compilerOptions: { outDir: "/repo/dist", rootDir: "/repo/lib" },
      fileNames: ["lib/cli.ts"] });
    expect(handlerOf({ "src/cli.ts": source, "lib/cli.ts": source }, [config({ status: "partial" }), other, config()])).toEqual({
      handler: fileOf("lib/cli.ts", source, { ...compiled("dist/cli.js", "settings-001#/configs/1"), rootDir: "lib" }),
      handlerReason: null });
  });

  test.each([
    ["a configuration that is not fully parsed", [config({ status: "partial" })], {}],
    ["a configuration without rootDir", [config({ compilerOptions: { outDir: "/repo/dist" } })], {}],
    ["a configuration whose outDir does not hold the bin file", [config({ compilerOptions: { outDir: "/repo/out",
      rootDir: "/repo/src" } })], {}],
    ["a source file that the configuration does not select", [config({ fileNames: [] })], {}],
    ["a source file that the snapshot does not hold", [config()], { "src/cli.ts": undefined }],
    ["no configuration", [], {}],
  ])("no link with %s", (_name, configs, change) => {
    const files = Object.fromEntries(Object.entries({ "src/cli.ts": source, ...change }).filter(([, text]) => text !== undefined));
    expect(handlerOf(files as Files, configs)).toEqual({ handler: null, handlerReason: unlinked("dist/cli.js") });
  });

  test("a bin file that is not UTF-8 text has no range, so the handler is null with a reason", () => {
    const text = json({ bin: { run: "bin/run" } });
    const [found] = findingsIn({ "package.json": text, "bin/run": "" }, "package.json", [], { "bin/run": notText }).candidates;
    expect({ handler: found?.handler, handlerReason: found?.handlerReason }).toEqual({ handler: null,
      handlerReason: "The snapshot holds the bin file bin/run, but it is not UTF-8 text, so the record gives no range for it." });
  });

  test("the range of a whole file does not count a byte order mark, and ends after its last line end", () => {
    const text = json({ bin: { run: "bin/cli.js" } });
    const [found] = findingsIn({ "package.json": text, "bin/cli.js": "﻿#!/usr/bin/env node\r\nrun();\r\n" }).candidates;
    expect(found?.handler).toEqual({ path: "bin/cli.js", range: [{ line: 1, column: 1 }, { line: 3, column: 1 }],
      evidence: { kind: "snapshot-file", binFile: "bin/cli.js" } });
  });
});

describe("binCandidates gives a gap for a value that names no file", () => {
  const gapAt = (text: string, marked: string, reason: string): Json => ({ kind: "unknown-settings-value", ruleId: "package-bin",
    ruleVersion: 1, entryKind: "cli-bin", range: rangeIn(text, marked),
    expression: marked.includes("«") ? marked.slice(marked.indexOf("«") + 1, marked.indexOf("»")) : marked, truncated: false, reason });

  test.each([
    ["a bin field that is not a path, an array or an object", json({ bin: 7 }), "\"bin\": «7»",
      "The bin field is not a path, an array of paths or an object of paths, so npm installs no command from it."],
    // npm stops with an error on such an array, so it installs none of the commands of the field.
    ["an array with an element that is not a path", json({ bin: ["bin/cli.js", 7] }),
      "\"bin\": «[\n    \"bin/cli.js\",\n    7\n  ]»",
      "An element of the bin array is not a path. npm stops with an error when it reads such a field, so it installs no " +
      "command from it."],
    ["a command whose value is not a path", json({ bin: { run: ["cli.js"] } }), "\"run\": «[\n      \"cli.js\"\n    ]»",
      "The value of the command is not a path, so npm installs no command for it."],
    ["a file that is not valid JSON", "{ \"bin\": ", "{ \"bin\": ",
      "The file is not a valid JSON object, so the rule cannot read its bin field."],
    ["a JSON value that is not an object", "[\"bin\"]\n", "[\"bin\"]",
      "The file is not a valid JSON object, so the rule cannot read its bin field."],
  ])("%s", (_name, text, marked, reason) => {
    expect(findingsIn({ "package.json": text })).toEqual({ candidates: [], gaps: [gapAt(text, marked, reason)] });
  });

  // npm, Stage 1 and Stage 2 read a package.json with JSON.parse. TypeScript's JSON parser also takes these texts.
  test.each([
    ["a comment", "{\n  // The commands of the package.\n  \"bin\": { \"myapp\": \"bin/cli.js\" }\n}\n"],
    ["a trailing comma", "{\n  \"bin\": { \"myapp\": \"bin/cli.js\", },\n}\n"],
    ["strings in single quotes", "{\n  'bin': { 'myapp': 'bin/cli.js' }\n}\n"],
    ["names without quotes", "{\n  bin: { myapp: \"bin/cli.js\" }\n}\n"],
  ])("a file with %s is not valid JSON, so the whole file is a gap", (_name, text) => {
    expect(findingsIn({ "package.json": text, "bin/cli.js": cli })).toEqual({ candidates: [],
      gaps: [gapAt(text, text, "The file is not a valid JSON object, so the rule cannot read its bin field.")] });
  });

  test("a byte order mark does not stop the rule, because npm skips it before JSON.parse", () => {
    const text = json({ bin: { myapp: "bin/cli.js" } });
    expect(findingsIn({ "package.json": "﻿" + text, "bin/cli.js": cli }).candidates.map(({ name, range }) => ({ name, range })))
      .toEqual([{ name: "myapp", range: rangeIn(text, "\"myapp\": «\"bin/cli.js\"»") }]);
  });

  test("no candidate and no gap for a package without a bin field", () => {
    expect(findingsIn({ "package.json": json({ name: "tools", main: "index.js" }) })).toEqual({ candidates: [], gaps: [] });
  });

  // A gap has a range in the saved text, and the text of this file has none. The settings record reads each package.json.
  test("no candidate and no gap for a package.json that is not UTF-8 text", () => {
    expect(findingsIn({ "package.json": "" }, "package.json", [], { "package.json": notText })).toEqual({ candidates: [], gaps: [] });
  });
});

test("packageFiles gives the package.json files of the snapshot outside node_modules folders, in their order", () => {
  expect(packageFiles(["package.json", "src/package.json.ts", "node_modules/a/package.json", "apps/web/package.json",
    "apps/node_modules/b/package.json", "tools/package.json"])).toEqual(["package.json", "apps/web/package.json", "tools/package.json"]);
});
