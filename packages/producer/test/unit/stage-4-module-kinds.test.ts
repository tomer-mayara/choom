import { describe, expect, test } from "bun:test";
import { type CompilerModule, type EmittedKind, emittedKind, type KindRule, type ModuleKind, type NearestPackage, packageLookup }
  from "../../src/stage-4-module-kinds.ts";

// The module kind of the code that runs for a saved source file. It decides the
// condition that the Stage 4 graph resolves the file's import syntax with.
const ref = "settings-001#/configs/0/compilerOptions/module";
const setting = (value: number): CompilerModule => ({ value, ref });
const noPackage = (): NearestPackage => null;
const inPackage = (type: unknown) => (): NearestPackage => ({ path: "package.json", type });
const decided = (kind: ModuleKind, decidedBy: KindRule, more: Partial<EmittedKind> = {}): EmittedKind =>
  ({ kind, decidedBy, setting: null, packageJson: null, reason: null, ...more });

describe("the emitted module kind of a saved source file", () => {
  test("is an ES module for .mts and CommonJS for .cts, with any compiler module setting", () => {
    for (const compilerModule of [null, setting(1), setting(99), setting(199), setting(200)]) {
      expect(emittedKind("src/esm.mts", compilerModule, inPackage("commonjs"))).toEqual(decided("module", "extension"));
      expect(emittedKind("types/esm.d.mts", compilerModule, noPackage)).toEqual(decided("module", "extension"));
      expect(emittedKind("src/kind.cts", compilerModule, inPackage("module"))).toEqual(decided("commonjs", "extension"));
    }
  });

  test("keeps the syntax as written for JavaScript, for module Preserve and without a module setting", () => {
    for (const path of ["main.js", "main.jsx", "main.mjs", "main.cjs"])
      expect(emittedKind(path, setting(1), inPackage("module"))).toEqual(decided("syntax", "syntax"));
    expect(emittedKind("main.ts", setting(200), inPackage("module"))).toEqual(decided("syntax", "syntax"));
    expect(emittedKind("main.tsx", null, inPackage("module"))).toEqual(decided("syntax", "syntax"));
  });

  test("follows the compiler module setting CommonJS and ES2015 to ESNext for .ts and .tsx", () => {
    expect(emittedKind("main.ts", setting(1), inPackage("module"))).toEqual(decided("commonjs", "compiler-module", { setting: ref }));
    expect(emittedKind("types.d.ts", setting(1), noPackage)).toEqual(decided("commonjs", "compiler-module", { setting: ref }));
    for (const value of [5, 6, 7, 99])
      expect(emittedKind("view.tsx", setting(value), inPackage("commonjs"))).toEqual(decided("module", "compiler-module", { setting: ref }));
  });

  test("uses the type of the nearest package.json with Node16, Node18, Node20 and NodeNext", () => {
    for (const value of [100, 101, 102, 199]) {
      expect(emittedKind("main.ts", setting(value), inPackage("module")))
        .toEqual(decided("module", "package-type", { setting: ref, packageJson: "package.json" }));
      expect(emittedKind("main.ts", setting(value), inPackage("commonjs")))
        .toEqual(decided("commonjs", "package-type", { setting: ref, packageJson: "package.json" }));
    }
    expect(emittedKind("main.ts", setting(199), inPackage(undefined)))
      .toEqual(decided("commonjs", "package-type", { setting: ref, packageJson: "package.json" }));
    expect(emittedKind("main.ts", setting(199), noPackage)).toEqual(decided("commonjs", "package-type", { setting: ref,
      reason: "No indexed package.json is above the file, so Node runs its compiled code as CommonJS." }));
  });

  test("is unknown, with a reason, for a package.json that cannot decide", () => {
    expect(emittedKind("lib/main.ts", setting(100), () => ({ path: "lib/package.json", unreadable: "is not valid JSON" })))
      .toEqual(decided("unknown", "unknown", { setting: ref, packageJson: "lib/package.json", reason: "lib/package.json is not valid JSON." }));
    expect(emittedKind("main.ts", setting(199), inPackage("esm"))).toEqual(decided("unknown", "unknown", { setting: ref,
      packageJson: "package.json", reason: 'The type of package.json is not module or commonjs: "esm".' }));
  });

  test("is unknown, with a reason, for the compiler module settings None, AMD, UMD and System", () => {
    for (const [value, name] of [[0, "None"], [2, "AMD"], [3, "UMD"], [4, "System"]] as const)
      expect(emittedKind("main.ts", setting(value), inPackage("module"))).toEqual(decided("unknown", "unknown", { setting: ref,
        reason: `The compiler module setting ${name} gives code that the graph does not resolve by module kind.` }));
  });
});

describe("the nearest package.json of a saved source file", () => {
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "root", type: "module" }),
    "packages/a/package.json": JSON.stringify({ name: "a" }),
    "packages/b/package.json": "{ not json",
    "packages/c/package.json": "[]",
  };
  const indexed = new Set(Object.keys(files));

  test("comes from the indexed snapshot files only, and each package.json is read once", () => {
    const reads: string[] = [];
    const lookup = packageLookup(indexed, (path) => { reads.push(path); return Buffer.from(files[path] ?? ""); });
    expect(lookup("packages/a/src/deep/main.ts")).toEqual({ path: "packages/a/package.json", type: undefined });
    expect(lookup("packages/a/main.ts")).toEqual({ path: "packages/a/package.json", type: undefined });
    // packages/d has no indexed package.json, so the root package decides.
    expect(lookup("packages/d/main.ts")).toEqual({ path: "package.json", type: "module" });
    expect(lookup("main.ts")).toEqual({ path: "package.json", type: "module" });
    expect(reads).toEqual(["packages/a/package.json", "package.json"]);
  });

  test("says why a package.json cannot be read, and is null when no package.json is above the file", () => {
    const lookup = packageLookup(indexed, (path) => Buffer.from(files[path] ?? ""));
    expect(lookup("packages/b/main.ts")).toEqual({ path: "packages/b/package.json", unreadable: "is not valid JSON" });
    expect(lookup("packages/c/main.ts")).toEqual({ path: "packages/c/package.json", unreadable: "is not a JSON object" });
    expect(packageLookup(new Set(), () => Buffer.alloc(0))("src/main.ts")).toBeNull();
  });
});
