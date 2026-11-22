import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";
import * as tsMorph from "ts-morph";
import { checkSnapshotText, openSnapshotProject, openSyntaxReader, type OutsideRead, parseSnapshotText, type ProjectSettings,
  type SnapshotProject } from "../../src/snapshot-project.ts";
import type { InventoryFile } from "../../src/stage-1-settings.ts";
import { makeScratch, removeScratch } from "../support/commands.ts";
import { writeFiles } from "../support/stage-1-run.ts";

// The snapshot project on a saved snapshot in a scratch folder. The inventory lists
// the indexed files; the folder can also hold files that the inventory does not
// list, as a capture exclusion leaves them out.
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const app = "/// <reference path=\"./env.d.ts\" />\n/// <reference path=\"./present.d.ts\" />\n" +
  "/// <reference types=\"node\" />\nimport { greet } from './greet.ts';\nexport const message = greet('Choom');\n";
const indexed: Record<string, string> = {
  "src/app.ts": app,
  "src/greet.ts": "export function greet(name: string): string {\n  return 'Hello ' + name;\n}\n",
  "src/present.d.ts": "declare const present: boolean;\n",
  "types/local/index.d.ts": "declare const local: number;\n",
};
// Files in the snapshot folder that the inventory does not list.
const notIndexed: Record<string, string> = {
  "src/extra.ts": "export const extra = 1;\n",
  "node_modules/left-pad/package.json": "{ \"name\": \"left-pad\", \"main\": \"index.js\" }\n",
  "node_modules/left-pad/index.js": "module.exports = () => '';\n",
};
const noSettings: ProjectSettings = { ref: null, configPath: null, files: [], compilerOptions: {} };

let scratch = "";
let snapshotRoot = "";
let files: InventoryFile[] = [];

beforeEach(() => {
  scratch = makeScratch();
  snapshotRoot = join(scratch, "snapshot");
  writeFiles(snapshotRoot, { ...indexed, ...notIndexed });
  files = Object.entries(indexed).map(([path, text]) => ({ path, kind: "file", bytes: Buffer.byteLength(text), sha256: sha256(text) }));
});

afterEach(() => removeScratch(scratch));

function opened(settings: ProjectSettings = noSettings): SnapshotProject {
  return openSnapshotProject({ files, snapshotRoot }, settings, tsMorph);
}

describe("openSnapshotProject", () => {
  test("holds the indexed snapshot files and reads each one when the project asks for it", () => {
    const project = opened();
    expect(project.project.getSourceFiles()).toEqual([]);
    expect(project.sourceFile("src/greet.ts").getFullText()).toBe(indexed["src/greet.ts"] as string);
    expect(project.project.getSourceFiles().map((file) => String(file.getFilePath()))).toEqual(["/repo/src/greet.ts"]);
    expect(project.outsideReads()).toEqual([]);
  });

  test("refuses a path that is not an indexed regular file, also when the file is in the snapshot folder", () => {
    expect(() => opened().sourceFile("src/extra.ts")).toThrow(new Error("Path is outside the indexed regular files: src/extra.ts"));
  });

  test("stops when an indexed file no longer matches its inventory digest", () => {
    writeFiles(snapshotRoot, { "src/greet.ts": (indexed["src/greet.ts"] as string).replace("Hello", "Howdy") });
    expect(() => opened().sourceFile("src/greet.ts")).toThrow(new Error("Snapshot integrity check failed: src/greet.ts"));
  });

  test("answers not found for a file that is only on disk, and records each request", () => {
    const { project, outsideReads } = opened();
    expect(project.addSourceFileAtPathIfExists("/repo/src/extra.ts")).toBeUndefined();
    const host = project.getModuleResolutionHost();
    for (const name of ["./extra.ts", "left-pad"])
      expect(tsMorph.ts.resolveModuleName(name, "/repo/src/app.ts", {}, host).resolvedModule).toBeUndefined();
    expect(tsMorph.ts.resolveModuleName("./greet.ts", "/repo/src/app.ts", {}, host).resolvedModule?.resolvedFileName)
      .toBe("/repo/src/greet.ts");
    const reads = outsideReads();
    const expected: OutsideRead[] = [{ operation: "read-file", path: "/repo/src/extra.ts" },
      { operation: "file-exists", path: "/repo/src/extra.ts" }, { operation: "directory-exists", path: "/repo/node_modules" }];
    for (const read of expected)
      expect(reads).toContainEqual(read);
    expect(reads.filter(({ path }) => path.startsWith("/repo/src/greet") || path === "/repo/src")).toEqual([]);
    expect(new Set(reads.map(({ operation, path }) => `${operation} ${path}`)).size).toBe(reads.length);
  });

  // A gap names only files of the snapshot as subjects: here the configuration file.
  // The missing file is in the missing field and the reason.
  test("lists a files entry that the snapshot does not hold as a gap, and still opens", () => {
    const project = opened({ ref: "settings-001#/configs/0", configPath: "/repo/tsconfig.json",
      files: ["src/app.ts", "types/env.d.ts", "../shared/global.d.ts"], compilerOptions: { strict: true } });
    expect(project.gaps()).toEqual([
      { kind: "missing-compiler-input", input: "files", missing: "types/env.d.ts", subjectRefs: ["tsconfig.json"],
        reason: "tsconfig.json (settings-001#/configs/0) names types/env.d.ts in its files list, but the snapshot does not " +
          "hold that file. The project opened without it." },
      { kind: "missing-compiler-input", input: "files", missing: "/shared/global.d.ts", subjectRefs: ["tsconfig.json"],
        reason: "tsconfig.json (settings-001#/configs/0) names /shared/global.d.ts in its files list, but the snapshot does not " +
          "hold that file. The project opened without it." },
    ]);
    expect(project.sourceFile("src/greet.ts").getFunctions().map((item) => item.getName())).toEqual(["greet"]);
  });

  test("lists a types entry that does not resolve in the snapshot as a gap", () => {
    const project = opened({ ref: "settings-001#/configs/0", configPath: "/repo/tsconfig.json", files: [],
      compilerOptions: { types: ["local", "node"], typeRoots: ["/repo/types"] } });
    expect(project.gaps()).toEqual([{ kind: "missing-compiler-input", input: "types", missing: "node",
      subjectRefs: ["tsconfig.json"], reason: "tsconfig.json (settings-001#/configs/0) names the type package node in its " +
        "types list, but the snapshot holds no declaration file for it. The project opened without it." }]);
  });

  // The subject of each gap is the loaded file that names the missing input.
  test("lists the reference directives of a loaded file that the snapshot does not hold as gaps", () => {
    const project = opened();
    project.sourceFile("src/app.ts");
    project.sourceFile("src/app.ts");
    expect(project.gaps()).toEqual([
      { kind: "missing-compiler-input", input: "reference-path", missing: "src/env.d.ts", subjectRefs: ["src/app.ts"],
        reason: "src/app.ts names src/env.d.ts in a reference path directive, but the snapshot does not hold that file." },
      { kind: "missing-compiler-input", input: "reference-types", missing: "node", subjectRefs: ["src/app.ts"],
        reason: "src/app.ts names the type package node in a reference types directive, but the snapshot holds no " +
          "declaration file for it." },
    ]);
  });
});

// The record checks read and check the saved bytes of a file themselves, then parse
// them. The parse must give the tree that the syntax reader gives for the saved file.
describe("parseSnapshotText", () => {
  const shape = (source: tsMorph.ts.SourceFile) => ({ fileName: source.fileName, text: source.text,
    statements: source.statements.map((statement) => [statement.kind, statement.pos, statement.end]) });

  test("parses the saved bytes of a file as the syntax reader parses the file", () => {
    const text = "\uFEFF// A header.\r\nexport function price(): number;\r\nexport function price() { return 1; }\r\n";
    writeFiles(snapshotRoot, { "src/price.ts": text });
    const inventory = [{ path: "src/price.ts", kind: "file", bytes: Buffer.byteLength(text), sha256: sha256(text) }];
    const read = openSyntaxReader({ files: inventory, snapshotRoot }, tsMorph)("src/price.ts", shape);
    expect(shape(parseSnapshotText("src/price.ts", Buffer.from(text), tsMorph))).toEqual(read);
    expect(read.text).toBe(text.slice(1));
  });

  test("stops at bytes that are not UTF-8 text", () => {
    expect(() => parseSnapshotText("src/price.ts", Buffer.from([0x61, 0xff, 0x0a]), tsMorph)).toThrow(TypeError);
  });
});

// The Stage 5 parts action reads and checks the saved bytes of a file, then binds
// the names of that file alone with the type checker.
describe("checkSnapshotText", () => {
  const price = "import { round } from './round';\n\nexport function price(round2: number): number {\n" +
    "  const round3 = round2;\n  return round(round3);\n}\n";
  // The identifiers of a file with a given text, in source order.
  function names(source: tsMorph.ts.SourceFile, text: string): tsMorph.ts.Identifier[] {
    const found: tsMorph.ts.Identifier[] = [];
    const visit = (node: tsMorph.ts.Node): void => {
      if (tsMorph.ts.isIdentifier(node) && node.text === text) found.push(node);
      tsMorph.ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
  }

  test("parses the saved bytes as parseSnapshotText does, and binds each use of a name to its declaration", () => {
    const { source, checker } = checkSnapshotText("src/price.ts", Buffer.from(price), tsMorph);
    const parsed = parseSnapshotText("src/price.ts", Buffer.from(price), tsMorph);
    expect(source.statements.map((statement) => [statement.kind, statement.pos, statement.end]))
      .toEqual(parsed.statements.map((statement) => [statement.kind, statement.pos, statement.end]));
    const [imported, used] = names(source, "round").map((name) => checker.getSymbolAtLocation(name));
    expect(imported).toBeDefined();
    expect(used).toBe(imported);
  });

  test("reads no other file, so an import of another file does not resolve", () => {
    writeFiles(snapshotRoot, { "src/round.ts": "export function round(value: number): number {\n  return value;\n}\n" });
    const { source, checker } = checkSnapshotText("src/price.ts", Buffer.from(price), tsMorph);
    const statement = source.statements[0] as tsMorph.ts.ImportDeclaration;
    expect(checker.getSymbolAtLocation(statement.moduleSpecifier)).toBeUndefined();
  });

  test("binds the names of a JavaScript file, with a require call that the compiler reads as an import", () => {
    const text = "const money = require('./money');\nfunction total() {\n  return money.round(1);\n}\n";
    const { source, checker } = checkSnapshotText("src/total.js", Buffer.from(text), tsMorph);
    const [declared, used] = names(source, "money").map((name) => checker.getSymbolAtLocation(name));
    expect(used).toBe(declared);
    expect((declared?.flags ?? 0) & tsMorph.ts.SymbolFlags.Alias).toBeTruthy();
  });

  test("stops at bytes that are not UTF-8 text", () => {
    expect(() => checkSnapshotText("src/price.ts", Buffer.from([0x61, 0xff, 0x0a]), tsMorph)).toThrow(TypeError);
  });
});
