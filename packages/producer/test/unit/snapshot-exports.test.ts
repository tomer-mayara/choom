import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";
import * as tsMorph from "ts-morph";
import { type ListedExport, listExports, type SourcePosition } from "../../src/snapshot-exports.ts";
import { openSnapshotProject } from "../../src/snapshot-project.ts";
import { withScratch } from "../support/commands.ts";
import { writeFiles } from "../support/stage-1-run.ts";

// listExports on one file of a saved snapshot, through a snapshot project without
// compiler settings. A range starts at the first character of the export and ends
// after its last character, as 1-based lines and columns.
type Expected = Omit<ListedExport, "range"> & { range: string };

function exportsOf(path: string, text: string): ListedExport[] {
  return withScratch((scratch) => {
    const snapshotRoot = join(scratch, "snapshot");
    writeFiles(snapshotRoot, { [path]: text });
    const files = [{ path, kind: "file", bytes: Buffer.byteLength(text), sha256: createHash("sha256").update(text).digest("hex") }];
    const project = openSnapshotProject({ files, snapshotRoot },
      { ref: null, configPath: null, files: [], compilerOptions: {} }, tsMorph);
    return listExports(project, path);
  });
}

function position(text: string, offset: number): SourcePosition {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length, column: (lines.at(-1) ?? "").length + 1 };
}

// Each expected range is the exact text of the export in the file. When the text is
// not unique, « and » mark the range inside a unique part of the file.
function expectExports(path: string, text: string, expected: Expected[]): void {
  expect(exportsOf(path, text)).toEqual(expected.map(({ range, ...item }) => {
    const [first, last] = range.includes("«") ? [range.indexOf("«"), range.indexOf("»") - 1] : [0, range.length];
    const found = text.indexOf(range.replace("«", "").replace("»", ""));
    if (found < 0) throw new Error("The file has no text " + range);
    return { ...item, range: [position(text, found + first), position(text, found + last)] };
  }));
}

describe("listExports", () => {
  test("lists each exported declaration with its kind, and function overloads as one export", () => {
    const overloads = "export function greet(name: string): string;\nexport function greet(name: string[]): string;\n" +
      "export function greet(name: string | string[]): string {\n  return String(name);\n}";
    const text = [overloads, "export class Invoice {}", "export interface Line { amount: number }", "export type Total = number;",
      "export enum Status { Open, Paid }", "export const enum Mode { Fast }", "export const first = 1, second = 2;",
      "export let { a, b: [c, , d] } = { a: 1, b: [2, 3, 4] };", "export namespace Shapes { export const unit = 1; }",
      "export namespace Types { export interface Shape { size: number } }", "export declare function external(): void;",
      "function internal(): void {}", "@sealed export abstract class Base {}"].join("\n") + "\n";
    const variable = (name: string, range: string): Expected => ({ name, kind: "variable", typeOnly: false, range });
    expectExports("src/model.ts", text, [
      { name: "greet", kind: "function", typeOnly: false, range: overloads },
      { name: "Invoice", kind: "class", typeOnly: false, range: "export class Invoice {}" },
      { name: "Line", kind: "interface", typeOnly: true, range: "export interface Line { amount: number }" },
      { name: "Total", kind: "type", typeOnly: true, range: "export type Total = number;" },
      { name: "Status", kind: "enum", typeOnly: false, range: "export enum Status { Open, Paid }" },
      { name: "Mode", kind: "enum", typeOnly: false, range: "export const enum Mode { Fast }" },
      variable("first", "export const first = 1, second = 2;"), variable("second", "export const first = 1, second = 2;"),
      ...["a", "c", "d"].map((name) => variable(name, "export let { a, b: [c, , d] } = { a: 1, b: [2, 3, 4] };")),
      { name: "Shapes", kind: "namespace", typeOnly: false, range: "export namespace Shapes { export const unit = 1; }" },
      { name: "Types", kind: "namespace", typeOnly: true, range: "export namespace Types { export interface Shape { size: number } }" },
      { name: "external", kind: "function", typeOnly: false, range: "export declare function external(): void;" },
      { name: "Base", kind: "class", typeOnly: false, range: "@sealed export abstract class Base {}" },
    ]);
  });

  // An anonymous default export is named default. export = is named export=.
  test.each<[string, string, Expected]>([
    ["an anonymous function", "export default function () {}\n",
      { name: "default", kind: "function", typeOnly: false, range: "export default function () {}" }],
    ["a named function", "export default function render() {}\n",
      { name: "default", kind: "function", typeOnly: false, range: "export default function render() {}", local: "render" }],
    ["an anonymous class", "export default class {}\n",
      { name: "default", kind: "class", typeOnly: false, range: "export default class {}" }],
    ["an interface", "export default interface Props { title: string }\n",
      { name: "default", kind: "interface", typeOnly: true, range: "export default interface Props { title: string }", local: "Props" }],
    ["a local variable", "const app = { start() {} };\nexport default app;\n",
      { name: "default", kind: "variable", typeOnly: false, range: "export default app;", local: "app" }],
    ["an arrow function", "export default () => 1;\n",
      { name: "default", kind: "function", typeOnly: false, range: "export default () => 1;" }],
    ["an object", "export default { name: 'config' };\n",
      { name: "default", kind: "expression", typeOnly: false, range: "export default { name: 'config' };" }],
    ["an imported binding", "import client from './client.ts';\nexport default client;\n",
      { name: "default", kind: "re-export", typeOnly: null, range: "export default client;", local: "client",
        from: { module: "./client.ts", name: "default" } }],
    ["export = of a local function", "function legacy() {}\nexport = legacy;\n",
      { name: "export=", kind: "function", typeOnly: false, range: "export = legacy;", local: "legacy" }],
    ["export = of an object", "export = { version: 1 };\n",
      { name: "export=", kind: "expression", typeOnly: false, range: "export = { version: 1 };" }],
  ])("names a default export or export = of %s", (_name, text, expected) => {
    expectExports("src/entry.ts", text, [expected]);
  });

  test("lists export lists, re-exports and export *, with the module that each re-export names", () => {
    const text = ["import { parse, type Options } from './parse.ts';", "import type { Config } from './config.ts';",
      "import * as path from 'node:path';", "interface Shape { size: number }", "const Shape = { unit: 1 };", "function helper() {}",
      "export { helper, helper as aid, type Shape as ShapeType, Shape, parse, Options, Config, path, missing, helper as 'help me' };",
      "export type { helper as helperType };", "export { format, default as Formatter } from './format.ts';",
      "export type { Theme } from './theme.ts';", "export * from './colors.ts';", "export * as icons from './icons.ts';",
      "export type * from './types.ts';", "export { 'quoted name' as quoted } from './names.ts';", "export {};"].join("\n") + "\n";
    const listed = (name: string, kind: ListedExport["kind"], typeOnly: boolean | null, local: string, range: string): Expected =>
      ({ name, kind, typeOnly, range, local });
    const reExport = (name: string, typeOnly: boolean | null, module: string, from: string, range: string): Expected =>
      ({ name, kind: "re-export", typeOnly, range, from: { module, name: from } });
    expectExports("src/index.ts", text, [
      listed("helper", "function", false, "helper", "export { «helper», helper"),
      listed("aid", "function", false, "helper", "helper as aid"),
      listed("ShapeType", "interface", true, "Shape", "type Shape as ShapeType"),
      listed("Shape", "variable", false, "Shape", "ShapeType, «Shape», parse"),
      { ...listed("parse", "re-export", null, "parse", "Shape, «parse», Options"), from: { module: "./parse.ts", name: "parse" } },
      { ...listed("Options", "re-export", true, "Options", "parse, «Options», Config"),
        from: { module: "./parse.ts", name: "Options" } },
      { ...listed("Config", "re-export", true, "Config", "Options, «Config», path"), from: { module: "./config.ts", name: "Config" } },
      { ...listed("path", "re-export", null, "path", "Config, «path», missing"), from: { module: "node:path", name: "*" } },
      listed("missing", "unknown", null, "missing", "path, «missing», helper"),
      listed("help me", "function", false, "helper", "helper as 'help me'"),
      listed("helperType", "function", true, "helper", "helper as helperType"),
      reExport("format", null, "./format.ts", "format", "export { «format», default"),
      reExport("Formatter", null, "./format.ts", "default", "default as Formatter"),
      reExport("Theme", true, "./theme.ts", "Theme", "export type { «Theme» }"),
      reExport("*", null, "./colors.ts", "*", "export * from './colors.ts';"),
      reExport("icons", null, "./icons.ts", "*", "export * as icons from './icons.ts';"),
      reExport("*", true, "./types.ts", "*", "export type * from './types.ts';"),
      reExport("quoted", null, "./names.ts", "quoted name", "'quoted name' as quoted"),
    ]);
  });

  test("lists an exported import alias and leaves out what is not an export of the file", () => {
    const text = ["namespace Geometry { export const unit = 1; }", "export import files = require('node:fs');",
      "export import unit = Geometry.unit;", "declare module 'virtual:config' { export const config: unknown; }",
      "declare global { interface Window { app: unknown } }", "export as namespace Library;",
      "module.exports = { legacy: true };", "exports.helper = () => 1;", "export const kept = 1;"].join("\n") + "\n";
    expectExports("src/aliases.ts", text, [
      { name: "files", kind: "re-export", typeOnly: null, range: "export import files = require('node:fs');",
        from: { module: "node:fs", name: "*" } },
      { name: "unit", kind: "alias", typeOnly: null, range: "export import unit = Geometry.unit;" },
      { name: "kept", kind: "variable", typeOnly: false, range: "export const kept = 1;" },
    ]);
  });
});
