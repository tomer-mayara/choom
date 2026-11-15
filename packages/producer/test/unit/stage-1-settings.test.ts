import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";
import * as tsMorph from "ts-morph";
import { choomDefaultProfile } from "../../src/parsing-profile.ts";
import { readProjectSettings, type SettingsRecord } from "../../src/stage-1-settings.ts";
import { withScratch } from "../support/commands.ts";
import { noSettingsTarget, writeFiles } from "../support/stage-1-run.ts";

// readProjectSettings reads the settings of a saved snapshot in a scratch folder,
// with the inventory that Stage 1 capture would save for it.
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const json = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";
const snapshotId = "snapshot-check";

function settingsOf(files: Record<string, string>, extraConfigs: string[] = []): SettingsRecord {
  return withScratch((scratch) => {
    const snapshotRoot = join(scratch, "snapshot");
    writeFiles(snapshotRoot, files);
    const inventory = { snapshotId, files: Object.entries(files).map(([path, text]) =>
      ({ path, kind: "file", bytes: Buffer.byteLength(text), sha256: sha256(text) })) };
    return readProjectSettings({ inventory, snapshotRoot, extraConfigs }, { tsMorph, parsingProfile: choomDefaultProfile });
  });
}

describe("readProjectSettings", () => {
  test("names the Choom parsing profile and a gap when the snapshot has no tsconfig.json and no jsconfig.json", () => {
    const settings = settingsOf(noSettingsTarget);
    expect(settings).toMatchObject({ formatVersion: 2, snapshotId, configs: [], parsingProfile: choomDefaultProfile,
      gaps: [{ kind: "no-project-settings", subjectRefs: [snapshotId], reason: "No project settings were found. " +
        "The snapshot has no tsconfig*.json or jsconfig*.json file, and the operator named no extra compiler settings. " +
        "The source is parsed with the named Choom parsing profile choom-default-v1. " +
        "Its options are Choom assumptions, not settings of the project." }] });
    expect(settings.packages.map(({ path }) => path)).toEqual(["package.json"]);
  });

  test("reads a jsconfig.json like a tsconfig.json, with the jsconfig defaults of TypeScript, and uses no profile then", () => {
    const jsconfig = json({ compilerOptions: { checkJs: true, module: "esnext" }, include: ["src"] });
    const settings = settingsOf({ "jsconfig.json": jsconfig, "src/app.js": "export const app = 1;\n",
      "src/types.ts": "export type Shape = { size: number };\n" });
    expect(settings.configs).toEqual([{ path: "/repo/jsconfig.json", status: "parsed", diagnostics: [],
      declared: { compilerOptions: { checkJs: true, module: "esnext" }, include: ["src"] },
      compilerOptions: { allowJs: true, maxNodeModuleJsDepth: 2, allowSyntheticDefaultImports: true, skipLibCheck: true,
        noEmit: true, checkJs: true, module: 99, configFilePath: "/repo/jsconfig.json" },
      fileNames: ["src/app.js", "src/types.ts"], references: [] }]);
    expect(settings.contentReads).toEqual([{ path: "jsconfig.json", bytes: Buffer.byteLength(jsconfig), sha256: sha256(jsconfig) }]);
    expect({ parsingProfile: settings.parsingProfile, gaps: settings.gaps }).toEqual({ parsingProfile: null, gaps: [] });
  });

  test("uses no profile when the operator names extra compiler settings", () => {
    const custom = json({ compilerOptions: { allowJs: true }, include: ["../src"] });
    const settings = settingsOf({ ...noSettingsTarget, "configs/custom.json": custom }, ["configs/custom.json"]);
    expect(settings.configs.map(({ path, status }) => ({ path, status }))).toEqual([{ path: "/repo/configs/custom.json", status: "parsed" }]);
    expect({ parsingProfile: settings.parsingProfile, gaps: settings.gaps }).toEqual({ parsingProfile: null, gaps: [] });
  });
});
