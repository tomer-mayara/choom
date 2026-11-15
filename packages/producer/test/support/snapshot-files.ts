import { createHash } from "node:crypto";
import { join } from "node:path";
import * as tsMorph from "ts-morph";
import { openSnapshotProject, type SnapshotProject } from "../../src/snapshot-project.ts";
import { writeFiles } from "./stage-1-run.ts";

// A snapshot project on saved files in a scratch folder, with every file added, as
// a Stage 4 query adds the files of its scope.
export type Files = Record<string, string>;

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

export function projectOf(scratch: string, files: Files, compilerOptions: Record<string, unknown> = { allowJs: true }):
  SnapshotProject {
  const snapshotRoot = join(scratch, "snapshot");
  writeFiles(snapshotRoot, files);
  const inventory = Object.entries(files).map(([path, text]) =>
    ({ path, kind: "file", bytes: Buffer.byteLength(text), sha256: sha256(text) }));
  const project = openSnapshotProject({ files: inventory, snapshotRoot },
    { ref: null, configPath: null, files: [], compilerOptions }, tsMorph);
  for (const path of Object.keys(files)) project.sourceFile(path);
  return project;
}
