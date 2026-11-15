import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";
import * as tsMorph from "ts-morph";
import { openSnapshotProject } from "../../src/snapshot-project.ts";
import { findReferences, type ReferenceKind, type SymbolReferences } from "../../src/snapshot-references.ts";
import { withScratch } from "../support/commands.ts";
import { rangeIn } from "../support/source-ranges.ts";
import { writeFiles } from "../support/stage-1-run.ts";

// findReferences on a saved snapshot. The test adds the files of `searched` to a
// snapshot project, as the Stage 4 references action adds the files of its scope.
// A range starts at the first character of the name at the site and ends after
// its last character, as 1-based lines and columns.
type Files = Record<string, string>;
interface Expected { path: string; kind: ReferenceKind; localName: string; at: string }

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

function referencesIn(files: Files, path: string, symbol: string,
  { searched = Object.keys(files), compilerOptions = {} }: { searched?: string[]; compilerOptions?: Record<string, unknown> } = {},
): SymbolReferences {
  return withScratch((scratch) => {
    const snapshotRoot = join(scratch, "snapshot");
    writeFiles(snapshotRoot, files);
    const inventory = Object.entries(files).map(([file, text]) =>
      ({ path: file, kind: "file", bytes: Buffer.byteLength(text), sha256: sha256(text) }));
    const project = openSnapshotProject({ files: inventory, snapshotRoot },
      { ref: null, configPath: null, files: [], compilerOptions }, tsMorph);
    for (const file of searched) project.sourceFile(file);
    return findReferences(project, path, symbol);
  });
}

function expectReferences(files: Files, found: SymbolReferences, expected: Expected[]): void {
  expect(found.references).toEqual(expected.map(({ path, kind, localName, at }) =>
    ({ path, range: rangeIn(files[path] ?? "", at), kind, localName })));
}

const invoicePath = "src/invoice.ts";
const invoice = "export interface Invoice { id: string }\n\n" +
  "export function createInvoice(id: string): Invoice {\n  return { id };\n}\n\nexport const draft = createInvoice('draft');\n";

describe("findReferences", () => {
  test("lists the import and the uses of each other file, and the declaration only as the declaration", () => {
    const files: Files = {
      [invoicePath]: invoice,
      "src/orders.ts": "import { createInvoice } from './invoice';\n\nexport const order = createInvoice('order');\n",
      "src/shop.ts": "import { createInvoice } from './invoice';\n\nexport function sell(id: string) {\n  return createInvoice(id);\n}\n",
    };
    const found = referencesIn(files, invoicePath, "createInvoice");
    expect(found.declarations).toEqual([{ path: invoicePath,
      range: rangeIn(invoice, "export function createInvoice(id: string): Invoice {\n  return { id };\n}") }]);
    expectReferences(files, found, [
      { path: invoicePath, kind: "call", localName: "createInvoice", at: "draft = «createInvoice»" },
      { path: "src/orders.ts", kind: "import", localName: "createInvoice", at: "import { «createInvoice» }" },
      { path: "src/orders.ts", kind: "call", localName: "createInvoice", at: "order = «createInvoice»" },
      { path: "src/shop.ts", kind: "import", localName: "createInvoice", at: "import { «createInvoice» }" },
      { path: "src/shop.ts", kind: "call", localName: "createInvoice", at: "return «createInvoice»" },
    ]);
  });

  test("follows renamed exports, export * from, renamed imports and namespace imports, with the local name of each site", () => {
    const files: Files = {
      [invoicePath]: invoice,
      "src/index.ts": "export { createInvoice as make } from './invoice';\nexport * from './invoice';\n",
      "src/renamed.ts": "import { createInvoice as ci } from './invoice';\n\nci('renamed');\n",
      "src/space.ts": "import * as billing from './invoice';\n\nbilling.createInvoice('space');\nbilling['createInvoice']('quoted');\n",
      "src/made.ts": "import { make } from './index';\n\nmake('made');\n",
      "src/starred.ts": "import { createInvoice } from './index';\n\ncreateInvoice('starred');\n",
    };
    expectReferences(files, referencesIn(files, invoicePath, "createInvoice"), [
      { path: "src/index.ts", kind: "re-export", localName: "make", at: "export { «createInvoice as make» }" },
      { path: "src/index.ts", kind: "re-export", localName: "createInvoice", at: "export * from './invoice';" },
      { path: invoicePath, kind: "call", localName: "createInvoice", at: "draft = «createInvoice»" },
      { path: "src/made.ts", kind: "import", localName: "make", at: "import { «make» }" },
      { path: "src/made.ts", kind: "call", localName: "make", at: "«make»('made')" },
      { path: "src/renamed.ts", kind: "import", localName: "ci", at: "import { «createInvoice as ci» }" },
      { path: "src/renamed.ts", kind: "call", localName: "ci", at: "«ci»('renamed')" },
      { path: "src/space.ts", kind: "call", localName: "billing.createInvoice", at: "«billing.createInvoice»('space')" },
      { path: "src/space.ts", kind: "call", localName: "billing['createInvoice']", at: "«billing['createInvoice']»('quoted')" },
      { path: "src/starred.ts", kind: "import", localName: "createInvoice", at: "import { «createInvoice» }" },
      { path: "src/starred.ts", kind: "call", localName: "createInvoice", at: "«createInvoice»('starred')" },
    ]);
  });

  test("gives a call, a type use, an import, a re-export and any other use its kind", () => {
    const uses = "import { createInvoice as ci } from './invoice';\nimport type { Invoice } from './invoice';\n\n" +
      "const pick = ci;\nexport const kept: typeof ci = ci;\nexport const made = new (ci as any)('new');\n" +
      "export const tagged = (ci as any)`tag`;\nexport const holder = { ci };\nexport default ci;\nexport { ci as again };\n" +
      "const total: Invoice = ci('total');\n";
    const files: Files = { [invoicePath]: invoice, "src/uses.ts": uses };
    expectReferences(files, referencesIn(files, invoicePath, "createInvoice"), [
      { path: invoicePath, kind: "call", localName: "createInvoice", at: "draft = «createInvoice»" },
      { path: "src/uses.ts", kind: "import", localName: "ci", at: "import { «createInvoice as ci» }" },
      { path: "src/uses.ts", kind: "value", localName: "ci", at: "pick = «ci»" },
      { path: "src/uses.ts", kind: "type", localName: "ci", at: "typeof «ci» =" },
      { path: "src/uses.ts", kind: "value", localName: "ci", at: "= «ci»;\nexport const made" },
      { path: "src/uses.ts", kind: "call", localName: "ci", at: "new («ci» as any)" },
      { path: "src/uses.ts", kind: "call", localName: "ci", at: "(«ci» as any)`tag`" },
      { path: "src/uses.ts", kind: "value", localName: "ci", at: "{ «ci» }" },
      { path: "src/uses.ts", kind: "re-export", localName: "default", at: "export default «ci»;" },
      { path: "src/uses.ts", kind: "re-export", localName: "again", at: "export { «ci as again» }" },
      { path: "src/uses.ts", kind: "call", localName: "ci", at: "Invoice = «ci»('total')" },
    ]);
    const types = referencesIn(files, invoicePath, "Invoice");
    expectReferences(files, types, [
      { path: invoicePath, kind: "type", localName: "Invoice", at: "): «Invoice» {" },
      { path: "src/uses.ts", kind: "import", localName: "Invoice", at: "import type { «Invoice» }" },
      { path: "src/uses.ts", kind: "type", localName: "Invoice", at: "total: «Invoice»" },
    ]);
  });

  test("reads a class extends clause as a value, an implements clause and a type-only re-export as types, and keeps a use inside the declaration", () => {
    const files: Files = {
      "src/base.ts": "export class Base {\n  static make(): Base {\n    return new Base();\n  }\n}\n\nexport interface Shape { size: number }\n",
      "src/shapes.ts": "import { Base, Shape } from './base';\n\nexport class Square extends Base implements Shape {\n  size = 1;\n}\n",
      "src/types.ts": "export type { Shape as Form } from './base';\n",
    };
    expectReferences(files, referencesIn(files, "src/base.ts", "Base"), [
      { path: "src/base.ts", kind: "type", localName: "Base", at: "make(): «Base»" },
      { path: "src/base.ts", kind: "call", localName: "Base", at: "new «Base»()" },
      { path: "src/shapes.ts", kind: "import", localName: "Base", at: "import { «Base»," },
      { path: "src/shapes.ts", kind: "value", localName: "Base", at: "extends «Base»" },
    ]);
    expectReferences(files, referencesIn(files, "src/base.ts", "Shape"), [
      { path: "src/shapes.ts", kind: "import", localName: "Shape", at: "Base, «Shape» }" },
      { path: "src/shapes.ts", kind: "type", localName: "Shape", at: "implements «Shape»" },
      { path: "src/types.ts", kind: "re-export", localName: "Form", at: "{ «Shape as Form» }" },
    ]);
  });

  test("finds the default export of a file under the name default, and a top-level declaration that the file does not export", () => {
    const files: Files = {
      "src/render.tsx": "export default function () {\n  return null;\n}\n\nfunction helper() {}\nhelper();\n",
      "src/page.tsx": "import Render from './render';\n\nexport const page = <Render />;\n",
    };
    const options = { compilerOptions: { jsx: 4 } };
    const rendered = referencesIn(files, "src/render.tsx", "default", options);
    expect(rendered.declarations).toEqual([{ path: "src/render.tsx",
      range: rangeIn(files["src/render.tsx"] ?? "", "export default function () {\n  return null;\n}") }]);
    expectReferences(files, rendered, [
      { path: "src/page.tsx", kind: "import", localName: "Render", at: "import «Render» from" },
      { path: "src/page.tsx", kind: "call", localName: "Render", at: "<«Render» />" },
    ]);
    expectReferences(files, referencesIn(files, "src/render.tsx", "helper", options), [
      { path: "src/render.tsx", kind: "call", localName: "helper", at: "«helper»();" },
    ]);
  });

  test("finds the value of export = under the name export=, as the exports record names it", () => {
    const files: Files = {
      "src/legacy.ts": "function createInvoice(id: string) {\n  return { id };\n}\n\nexport = createInvoice;\n",
      "src/user.ts": "import make = require('./legacy');\n\nmake('user');\n",
    };
    const found = referencesIn(files, "src/legacy.ts", "export=");
    expect(found.declarations.map(({ path }) => path)).toEqual(["src/legacy.ts"]);
    expectReferences(files, found, [
      { path: "src/legacy.ts", kind: "re-export", localName: "export=", at: "export = «createInvoice»;" },
      { path: "src/user.ts", kind: "import", localName: "make", at: "import «make» = require" },
      { path: "src/user.ts", kind: "call", localName: "make", at: "«make»('user')" },
    ]);
  });

});

describe("findReferences through module loading, and the files that it searches", () => {
  test("follows a require call of a JavaScript file and a dynamic import with a literal name", () => {
    const files: Files = {
      [invoicePath]: invoice,
      "src/legacy.js": "const { createInvoice: make } = require('./invoice');\n\nmake('legacy');\n",
      "src/lazy.ts": "export async function later() {\n  const billing = await import('./invoice');\n" +
        "  return billing.createInvoice('later');\n}\n",
    };
    expectReferences(files, referencesIn(files, invoicePath, "createInvoice", { compilerOptions: { allowJs: true } }), [
      { path: invoicePath, kind: "call", localName: "createInvoice", at: "draft = «createInvoice»" },
      { path: "src/lazy.ts", kind: "call", localName: "billing.createInvoice", at: "return «billing.createInvoice»" },
      { path: "src/legacy.js", kind: "import", localName: "make", at: "{ «createInvoice: make» }" },
      { path: "src/legacy.js", kind: "call", localName: "make", at: "«make»('legacy')" },
    ]);
  });

  // The record notes name this limit, and the Stage 4 record lists the call as unresolved.
  test("does not follow a require call in a TypeScript file", () => {
    const files: Files = {
      [invoicePath]: invoice,
      "src/required.cts": "const { createInvoice } = require('./invoice');\n\ncreateInvoice('required');\n",
    };
    expectReferences(files, referencesIn(files, invoicePath, "createInvoice"), [
      { path: invoicePath, kind: "call", localName: "createInvoice", at: "draft = «createInvoice»" },
    ]);
  });

  // Changed on purpose: the shorthand form is a site too, and the uses of the local names are followed.
  test("follows the local names that a destructuring of a module object binds, also in another file", () => {
    const files: Files = {
      [invoicePath]: invoice,
      "src/unpacked.ts": "export async function later() {\n  const { createInvoice: make } = await import('./invoice');\n" +
        "  const { createInvoice } = await import('./invoice');\n  return [make('later'), createInvoice('again')];\n}\n",
      "src/lazy.js": "export async function lazy() {\n  const { createInvoice } = await import('./invoice');\n" +
        "  return createInvoice('lazy');\n}\n",
      "src/early.ts": "export const { createInvoice: early } = await import('./invoice');\n",
      "src/user.ts": "import { early } from './early';\n\nearly('user');\n",
      "src/legacy.js": "const { createInvoice } = require('./invoice');\n\ncreateInvoice('legacy');\n",
    };
    const options = { compilerOptions: { allowJs: true, module: 99, moduleResolution: 100, target: 99 } };
    expectReferences(files, referencesIn(files, invoicePath, "createInvoice", options), [
      { path: "src/early.ts", kind: "value", localName: "early", at: "{ «createInvoice»: early }" },
      { path: invoicePath, kind: "call", localName: "createInvoice", at: "draft = «createInvoice»" },
      { path: "src/lazy.js", kind: "value", localName: "createInvoice", at: "const { «createInvoice» }" },
      { path: "src/lazy.js", kind: "call", localName: "createInvoice", at: "return «createInvoice»" },
      { path: "src/legacy.js", kind: "import", localName: "createInvoice", at: "const { «createInvoice» }" },
      { path: "src/legacy.js", kind: "call", localName: "createInvoice", at: "«createInvoice»('legacy')" },
      { path: "src/unpacked.ts", kind: "value", localName: "make", at: "{ «createInvoice»: make }" },
      { path: "src/unpacked.ts", kind: "value", localName: "createInvoice", at: "  const { «createInvoice» } = await" },
      { path: "src/unpacked.ts", kind: "call", localName: "make", at: "«make»('later')" },
      { path: "src/unpacked.ts", kind: "call", localName: "createInvoice", at: "«createInvoice»('again')" },
      { path: "src/user.ts", kind: "import", localName: "early", at: "import { «early» }" },
      { path: "src/user.ts", kind: "call", localName: "early", at: "«early»('user')" },
    ]);
  });

  // The compiler reads src/outside.ts to resolve the import of src/inside.ts, but the query does not search it.
  test("searches only the files that the project holds, also when the compiler reads another file", () => {
    const files: Files = {
      [invoicePath]: invoice,
      "src/inside.ts": "import { createInvoice } from './invoice';\nimport { label } from './outside';\n\ncreateInvoice(label);\n",
      "src/outside.ts": "import { createInvoice } from './invoice';\n\nexport const label = createInvoice('outside').id;\n",
    };
    expectReferences(files, referencesIn(files, invoicePath, "createInvoice", { searched: [invoicePath, "src/inside.ts"] }), [
      { path: "src/inside.ts", kind: "import", localName: "createInvoice", at: "import { «createInvoice» }" },
      { path: "src/inside.ts", kind: "call", localName: "createInvoice", at: "«createInvoice»(label)" },
      { path: invoicePath, kind: "call", localName: "createInvoice", at: "draft = «createInvoice»" },
    ]);
  });

  test("stops when a file that the compiler reads to resolve an import no longer matches its inventory digest", () => {
    const files: Files = {
      [invoicePath]: invoice,
      "src/helper.ts": "export const helper = 1;\n",
      "src/orders.ts": "import { createInvoice } from './invoice';\nimport { helper } from './helper';\n\ncreateInvoice(String(helper));\n",
    };
    expect(() => withScratch((scratch) => {
      const snapshotRoot = join(scratch, "snapshot");
      writeFiles(snapshotRoot, files);
      const inventory = Object.entries(files).map(([file, text]) =>
        ({ path: file, kind: "file", bytes: Buffer.byteLength(text), sha256: sha256(text) }));
      // The same size, other bytes.
      writeFiles(snapshotRoot, { "src/helper.ts": "export const helper = 2;\n" });
      const project = openSnapshotProject({ files: inventory, snapshotRoot },
        { ref: null, configPath: null, files: [], compilerOptions: {} }, tsMorph);
      for (const file of [invoicePath, "src/orders.ts"]) project.sourceFile(file);
      return findReferences(project, invoicePath, "createInvoice");
    })).toThrow(new Error("Snapshot integrity check failed: src/helper.ts"));
  });

  test.each([
    ["a name that the file does not declare", "createInvoce", "No top-level declaration or export named createInvoce in src/orders.ts."],
    ["a name that the file only imports", "createInvoice", "No top-level declaration or export named createInvoice in src/orders.ts."],
    ["an export that names a module that the snapshot does not hold", "lost",
      "The export lost of src/orders.ts does not name a declaration in the snapshot."],
  ])("refuses %s", (_name, symbol, message) => {
    const files: Files = { [invoicePath]: invoice,
      "src/orders.ts": "import { createInvoice } from './invoice';\nexport { lost } from './missing';\n\ncreateInvoice('order');\n" };
    expect(() => referencesIn(files, "src/orders.ts", symbol)).toThrow(new Error(message));
  });
});
