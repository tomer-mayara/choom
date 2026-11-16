import { describe, expect, test } from "bun:test";
import * as tsMorph from "ts-morph";
import { divideFile, type FileDivision, restOwner, type SourceRange } from "../../src/code-units.ts";
import { parseSnapshotText } from "../../src/snapshot-project.ts";
import { textAt } from "../support/source-ranges.ts";

// divideFile on in-memory files, parsed as the record checks parse a saved file.
// A symbol unit holds its top-level declaration, the comments directly above it and
// the comments after it on its last line. The rest unit holds all other text. A
// range starts at its first character and ends after its last character, in 1-based
// lines and columns of the text that the parser read.
const divide = (text: string, symbols: string[], path = "src/billing.ts"): FileDivision =>
  divideFile(tsMorph.ts, parseSnapshotText(path, Buffer.from(text), tsMorph), symbols);

// The ranges of a division in file order cover the whole text with no gap and no overlap.
function expectCover(text: string, { symbols, rest }: FileDivision): void {
  const ranges = [...symbols.flatMap((part) => part.ranges), ...rest]
    .sort((first, second) => first[0].line - second[0].line || first[0].column - second[0].column);
  expect(ranges.map((range) => textAt(text, [range])).join("")).toBe(text);
  ranges.slice(1).forEach((range, index) => expect(range[0]).toEqual((ranges[index] as SourceRange)[1]));
}

// The text of each symbol unit and of each rest range, and a check that they cover the file.
function divided(text: string, symbols: string[]): { symbols: [string, string][]; rest: string[] } {
  const division = divide(text, symbols);
  expectCover(text, division);
  return { symbols: division.symbols.map(({ symbol, ranges }) => [symbol, textAt(text, ranges)]),
    rest: division.rest.map((range) => textAt(text, [range])) };
}

const billing = ["import { rate } from './rate';", "", "export function computeInvoice(total: number) {", "  return total * rate;",
  "}", "", "/** The price of a number of items. */", "export function computePrice(count: number) {", "  return count * 2;", "}",
  "", "export const currency = 'EUR';", ""].join("\n");
const invoice = "export function computeInvoice(total: number) {\n  return total * rate;\n}";
const price = "/** The price of a number of items. */\nexport function computePrice(count: number) {\n  return count * 2;\n}";

describe("divideFile", () => {
  test("gives a symbol in the middle of a file one unit, and all other text one rest unit", () => {
    expect(divided(billing, ["computePrice"])).toEqual({ symbols: [["computePrice", price]],
      rest: [`import { rate } from './rate';\n\n${invoice}\n\n`, "\n\nexport const currency = 'EUR';\n"] });
  });

  test("gives each symbol its unit in file order, and the text between them to the rest", () => {
    expect(divided(billing, ["computePrice", "computeInvoice"])).toEqual({
      symbols: [["computeInvoice", invoice], ["computePrice", price]],
      rest: ["import { rate } from './rate';\n\n", "\n\n", "\n\nexport const currency = 'EUR';\n"] });
  });

  test("divides a symbol at the start and a symbol at the end of a file", () => {
    const text = "/** The first. */\nexport function first() {}\nconst middle = 1;\nexport function last() {}";
    expect(divided(text, ["first", "last"])).toEqual({
      symbols: [["first", "/** The first. */\nexport function first() {}"], ["last", "export function last() {}"]],
      rest: ["\nconst middle = 1;\n"] });
  });

  test("gives no rest unit when the symbols hold all text", () => {
    expect(divided("export function only() {}", ["only"])).toEqual({ symbols: [["only", "export function only() {}"]], rest: [] });
  });

  test("keeps the comments directly above a declaration and after it on its last line, and not a comment after a blank line", () => {
    const text = ["// The header of the file.", "", "// The price of one item.", "/** In cents. */",
      "export function price() {} // Not rounded.", "// The next value.", "export const next = 1;", ""].join("\n");
    expect(divided(text, ["price"])).toEqual({
      symbols: [["price", "// The price of one item.\n/** In cents. */\nexport function price() {} // Not rounded."]],
      rest: ["// The header of the file.\n\n", "\n// The next value.\nexport const next = 1;\n"] });
  });

  test("leaves a comment on the line of the statement before in the rest", () => {
    const text = "const rate = 2; // The rate.\nexport function price() {}\n";
    expect(divided(text, ["price"])).toEqual({ symbols: [["price", "export function price() {}"]],
      rest: ["const rate = 2; // The rate.\n", "\n"] });
  });

  test("leaves a first line that starts with #! in the rest", () => {
    expect(divided("#!/usr/bin/env node\nexport function main() {}\n", ["main"]))
      .toEqual({ symbols: [["main", "export function main() {}"]], rest: ["#!/usr/bin/env node\n", "\n"] });
  });

  test("does not count a byte order mark", () => {
    expect(divide("\uFEFFexport function price() {}\n", ["price"])).toEqual({
      symbols: [{ symbol: "price", ranges: [[{ line: 1, column: 1 }, { line: 1, column: 27 }]] }],
      rest: [[{ line: 1, column: 27 }, { line: 2, column: 1 }]] });
  });

  test("counts CRLF line ends", () => {
    const text = "const rate = 2;\r\n\r\n/** The price. */\r\nexport function price() {}\r\n";
    expect(divide(text, ["price"])).toEqual({
      symbols: [{ symbol: "price", ranges: [[{ line: 3, column: 1 }, { line: 4, column: 27 }]] }],
      rest: [[{ line: 1, column: 1 }, { line: 3, column: 1 }], [{ line: 4, column: 27 }, { line: 5, column: 1 }]] });
    expect(divided(text, ["price"]).symbols).toEqual([["price", "/** The price. */\r\nexport function price() {}"]]);
  });
});

describe("divideFile with special declarations", () => {
  test("gives the overloads of a function one unit", () => {
    const greet = ["export function greet(name: string): string;", "export function greet(names: string[]): string;",
      "/** Greets one name or several. */", "export function greet(value: string | string[]): string {",
      "  return String(value);", "}"].join("\n");
    expect(divided(`const prefix = 'Hello';\n${greet}\n`, ["greet"])).toEqual({ symbols: [["greet", greet]],
      rest: ["const prefix = 'Hello';\n", "\n"] });
  });

  test("gives a name with separate merged declarations one unit with several ranges", () => {
    const text = "export interface Price { cents: number }\nexport const tax = 1;\nexport interface Price { currency: string }\n";
    const division = divide(text, ["Price"]);
    expectCover(text, division);
    expect(division.symbols.map(({ symbol, ranges }) => [symbol, ranges.map((range) => textAt(text, [range]))])).toEqual([
      ["Price", ["export interface Price { cents: number }", "export interface Price { currency: string }"]]]);
  });

  test.each([
    ["function", "export default function () {\n  return 1;\n}"],
    ["class", "export default class {\n  size = 1;\n}"],
    ["value", "export default { size: 1 };"],
  ])("names an anonymous default %s default", (_kind, declaration) => {
    expect(divided(`const size = 1;\n${declaration}\n`, ["default"]))
      .toEqual({ symbols: [["default", declaration]], rest: ["const size = 1;\n", "\n"] });
  });

  test("names a named default export by its name only", () => {
    const text = "export default function named() {}\n";
    expect(divided(text, ["named"]).symbols).toEqual([["named", "export default function named() {}"]]);
    expect(() => divide(text, ["default"])).toThrow(new Error("The symbol selector default of src/billing.ts matched nothing: " +
      "the file has no top-level declaration with that name."));
  });

  test.each([
    ["two variables", "export const first = 1, second = 2;\n", "first", "first, second"],
    ["a destructuring", "export const { first, second } = values;\n", "second", "first, second"],
  ])("refuses %s in one declaration", (_name, text, symbol, names) => {
    expect(() => divide(text, [symbol])).toThrow(new Error(`The symbol selector ${symbol} of src/billing.ts names a declaration ` +
      `with several names: ${names}. A symbol needs a declaration of one name.`));
  });

  test.each(["rate", "tax", "inner", "missing"])("refuses %s, which is not a top-level declaration of the file", (symbol) => {
    const text = "import { rate } from './rate';\nexport { tax } from './tax';\nexport function outer() {\n  function inner() {}\n}\n";
    expect(() => divide(text, [symbol])).toThrow(new Error(`The symbol selector ${symbol} of src/billing.ts matched nothing: ` +
      "the file has no top-level declaration with that name."));
  });

  test("refuses a file with syntax errors", () => {
    expect(() => divide("export const = 1;\nexport function price() {}\n", ["price"])).toThrow(
      new Error("The symbol selectors cannot divide src/billing.ts: the file has syntax errors."));
  });
});

// The rest of a divided file belongs to the component whose path selectors select the
// file, by the rules of a whole file: an exact path or a subtree, less the excluded paths.
describe("restOwner", () => {
  const memberships = (entries: Record<string, { paths: string[]; excludePaths?: string[] }>) => new Map(Object.entries(entries));

  test("is the component whose path selectors select the file", () => {
    expect(restOwner("src/billing.ts", memberships({ billing: { paths: ["src/billing.ts"] }, pricing: { paths: [] } })))
      .toEqual({ owner: "billing" });
    expect(restOwner("src/billing.ts", memberships({ app: { paths: ["src/**"], excludePaths: ["src/pricing/**"] } })))
      .toEqual({ owner: "app" });
  });

  test("is null with the reason no-path-owner when no path selector selects the file", () => {
    expect(restOwner("src/billing.ts", memberships({ app: { paths: ["src/**"], excludePaths: ["src/billing.ts"] },
      pricing: { paths: [] } }))).toEqual({ owner: null, reason: "no-path-owner" });
  });

  test("refuses a file that the path selectors of two components select", () => {
    expect(() => restOwner("src/billing.ts", memberships({ app: { paths: ["src/**"] }, billing: { paths: ["src/billing.ts"] } })))
      .toThrow(new Error("Mapping and direct membership differ: src/billing.ts"));
  });
});
