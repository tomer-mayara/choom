import type { SnapshotFile } from "../../support/staged-run.ts";

// Small saved packages for the Stage 4 graph. In each package, source files load
// "#dep". The imports field of package.json gives "#dep" one target for the import
// condition, dep/index.mjs, and another for the require condition, dep/index.cjs.
// So an edge to "#dep" shows which condition resolved it.
export interface ModuleKindPackage {
  // The saved snapshot, with package.json.
  snapshot: SnapshotFile[];
  // The parsed compiler options of one configuration that selects every source
  // file, as the settings record holds them. Null: the snapshot has no compiler
  // settings, so its settings record names the Choom parsing profile.
  compilerOptions: Record<string, number> | null;
}

const dependency: SnapshotFile[] = [
  { path: "dep/index.mjs", text: "export const value = 'import';\n" },
  { path: "dep/index.cjs", text: "exports.value = 'require';\n" },
];

function manifest(fields: Record<string, string>): SnapshotFile {
  const imports = { "#dep": { import: "./dep/index.mjs", require: "./dep/index.cjs" } };
  return { path: "package.json", text: JSON.stringify({ name: "fixture", ...fields, imports }) + "\n" };
}

// A package with type "module" and no compiler settings. An ES module JavaScript
// file and a TypeScript file import "#dep", a .cjs file requires it, and another
// .cjs file loads it with import().
export const esModulePackage: ModuleKindPackage = {
  snapshot: [manifest({ type: "module" }), ...dependency,
    { path: "main.js", text: "import { value } from '#dep';\nexport const main = value;\n" },
    { path: "typed.ts", text: "import { value } from '#dep';\nexport const typed = value;\n" },
    { path: "legacy.cjs", text: "const { value } = require('#dep');\nmodule.exports = value;\n" },
    { path: "lazy.cjs", text: "module.exports = () => import('#dep');\n" }],
  compilerOptions: null,
};

// A package with no type field. Its TypeScript is compiled with module commonjs,
// so the compiled main.ts requires "#dep" and ./helper.
export const commonJsTypeScript: ModuleKindPackage = {
  snapshot: [manifest({}), ...dependency,
    { path: "main.ts", text: "import { value } from '#dep';\nimport { helper } from './helper';\nexport const main = value + helper;\n" },
    { path: "helper.ts", text: "export const helper = 1;\n" }],
  compilerOptions: { module: 1 },
};

// The import forms of the main file in the import forms package, by the "#..." name
// that each form loads.
const importFormNames = ["dep", "types", "side", "other", "kinds", "legacy", "lazy", "query"];

// A package with no type field whose main file, main.ts or another name such as
// main.cts, has each import form: a value import, a type-only import, a side-effect
// import, a re-export, a type-only re-export, import = require, a dynamic import(), a
// type query and a triple-slash reference. Each form loads its own name, which the
// imports field maps to <name>/index.mjs for the import condition and to
// <name>/index.cjs for the require condition.
export function importFormsPackage(compilerOptions: Record<string, number>, mainFile = "main.ts"): ModuleKindPackage {
  const imports = Object.fromEntries(importFormNames.map((name) =>
    [`#${name}`, { import: `./${name}/index.mjs`, require: `./${name}/index.cjs` }]));
  const main = ["/// <reference path='./globals.d.ts' />", "import { value } from '#dep';", "import type { Shape } from '#types';",
    "import '#side';", "export { value as other } from '#other';", "export type { Shape as Kind } from '#kinds';",
    "import legacy = require('#legacy');", "export const lazy = () => import('#lazy');",
    "export type Query = typeof import('#query');", "export const main: Shape = { value: value + String(legacy) };", ""];
  return { compilerOptions, snapshot: [
    { path: "package.json", text: JSON.stringify({ name: "forms", imports }) + "\n" },
    { path: mainFile, text: main.join("\n") },
    { path: "globals.d.ts", text: "declare const marker: string;\n" },
    ...importFormNames.flatMap((name) => [{ path: `${name}/index.mjs`, text: `export const value = '${name}-import';\n` },
      { path: `${name}/index.cjs`, text: `exports.value = '${name}-require';\n` }]),
  ] };
}

// A package with no type field. Its TypeScript is compiled with module and
// moduleResolution nodenext, so the compiled plain.ts and kind.cts are CommonJS
// and require "#dep", and the compiled esm.mts is an ES module that imports it.
export const nodeNextPackage: ModuleKindPackage = {
  snapshot: [manifest({}), ...dependency,
    { path: "plain.ts", text: "import { value } from '#dep';\nexport const plain = value;\n" },
    { path: "kind.cts", text: "import { value } from '#dep';\nexport const kind = value;\n" },
    { path: "esm.mts", text: "import { value } from '#dep';\nexport const esm = value;\n" }],
  compilerOptions: { module: 199, moduleResolution: 99 },
};
