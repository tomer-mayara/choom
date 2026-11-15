import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";
import * as tsMorph from "ts-morph";
import { openSnapshotProject, type OutsideRead, type ProjectSettings, type SnapshotProject } from "../../src/snapshot-project.ts";
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
});
