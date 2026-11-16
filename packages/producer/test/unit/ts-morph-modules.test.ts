import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkPinnedModules, loadTsMorph } from "../../src/ts-morph-modules.ts";
import { toolsRoot } from "../support/commands.ts";

// The ts-morph of the tool checkout, which divides a file by symbol selectors, and
// the check of its module files against the pins that a stage start saved.
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const nodeModules = join(toolsRoot, "node_modules");
const tsMorphModule = "ts-morph/dist/ts-morph.js";

describe("the ts-morph of the tool checkout", () => {
  test("gives its version, the version of its TypeScript and the SHA-256 of each module file that loading it read", () => {
    const { tools, versions } = loadTsMorph();
    const paths = Object.keys(versions.modules);
    expect(paths).toEqual([...paths].sort());
    expect(paths).toEqual(expect.arrayContaining([tsMorphModule, "@ts-morph/common/dist/typescript.js"]));
    expect(versions.modules).toEqual(Object.fromEntries(paths.map((path) => [path, sha256(readFileSync(join(nodeModules, path)))])));
    const metadata = JSON.parse(readFileSync(join(nodeModules, "ts-morph/package.json"), "utf8")) as { version: string };
    expect([versions.tsMorph, versions.typescript]).toEqual([metadata.version, tools.ts.version]);
  });
});

describe("the check of the module files of ts-morph against the pins of a stage start", () => {
  const { modules } = loadTsMorph().versions;
  const otherDigest = "0".repeat(64);

  test("accepts the module files that the pins name with their SHA-256, also among the pins of other modules", () => {
    expect(() => checkPinnedModules(modules, { "yaml/dist/index.js": otherDigest, ...modules }, "Stage 5 start")).not.toThrow();
  });

  test.each<[string, Record<string, string>]>([
    ["a module file with another SHA-256", { ...modules, [tsMorphModule]: otherDigest }],
    ["a module file that the pins do not name", Object.fromEntries(Object.entries(modules).filter(([path]) => path !== tsMorphModule))],
  ])("refuses %s, and names the file", (_name, pinned) => {
    expect(() => checkPinnedModules(modules, pinned, "Stage 5 start"))
      .toThrow(new Error(`Trusted parser module changed since Stage 5 start: ${tsMorphModule}`));
  });

  test("refuses a start that pinned no module files", () => {
    expect(() => checkPinnedModules(modules, undefined, "Stage 5 start")).toThrow(new Error("The Stage 5 start saved no pins of parser modules."));
  });
});
