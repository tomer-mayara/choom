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
