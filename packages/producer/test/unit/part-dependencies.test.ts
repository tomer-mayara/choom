import { describe, expect, test } from "bun:test";
import * as tsMorph from "ts-morph";
import { type PartDependencies, partDependencies, type PartName } from "../../src/part-dependencies.ts";
import { checkSnapshotText } from "../../src/snapshot-project.ts";

// partDependencies on in-memory files, with the type checker of the saved file alone,
// as the Stage 5 parts action reads a file. The symbols divide the file as the symbol
// selectors do. Each loading site of the file is one dependency: it is in one part, or
// at file level with a reason.
const place = (text: string, symbols: string[], path = "src/billing.ts"): PartDependencies => {
  const { source, checker } = checkSnapshotText(path, Buffer.from(text), tsMorph);
  return partDependencies({ ts: tsMorph.ts, checker }, source, symbols);
};
const partName = (part: PartName): string => part.unitKind === "symbol" ? part.symbol : "rest";

// Each part with the text of its dependencies, and each dependency at file level with its reason and the parts that use it.
function placed(text: string, symbols: string[], path?: string): { parts: Record<string, string[]>; file: string[][] } {
  const { parts, fileDependencies } = place(text, symbols, path);
  const textOf = ({ node }: { node: tsMorph.ts.Node }): string => node.getText();
  return { parts: Object.fromEntries(parts.map(({ part, dependencies }) => [partName(part), dependencies.map(textOf)])),
    file: fileDependencies.map((dependency) => [textOf(dependency), dependency.reason, ...(dependency.usedIn ?? []).map(partName)]) };
}

const lines = (...text: string[]): string => text.join("\n") + "\n";
const invoice = (body: string): string => `export function computeInvoice(total: number): number {\n  ${body}\n}`;
const price = (body: string, returns = "number"): string =>
  `/** The price of a number of items. */\nexport function computePrice(count: number): ${returns} {\n  ${body}\n}`;

describe("partDependencies with imports", () => {
  test("places an import in the one part that uses its names, also when the rest uses another import", () => {
    const text = lines("import { round } from './money';", "import { rate } from './rate';", "", invoice("return total * rate;"),
      "", price("return round(count * 2);"));
    expect(placed(text, ["computePrice"])).toEqual({
      parts: { computePrice: ["import { round } from './money';"], rest: ["import { rate } from './rate';"] }, file: [] });
  });

  test("places a type-only import by the same rule", () => {
    const text = lines("import type { Money } from './money';", "import { type Rate, rate } from './rate';", "",
      invoice("return total * (rate as Rate);"), "", price("return count as Money;", "Money"));
    expect(placed(text, ["computePrice"]).parts)
      .toEqual({ computePrice: ["import type { Money } from './money';"], rest: ["import { type Rate, rate } from './rate';"] });
  });

  test("places a default, a namespace and an import = binding by the uses of their names", () => {
    const text = lines("import Money from './money';", "import * as tax from './tax';", "import rates = require('./rates');", "",
      invoice("return rates.base(total);"), "", price("return tax.add(new Money(count).value);"));
    expect(placed(text, ["computePrice"]).parts).toEqual({
      computePrice: ["import Money from './money';", "import * as tax from './tax';"], rest: ["import rates = require('./rates');"] });
  });

  test("keeps an import with uses in several parts at file level as shared, with the parts that use it", () => {
    const text = lines("import { round } from './money';", "import Tax, { rate } from './tax';", "",
      invoice("return round(total * rate);"), "", price("return round(new Tax(count).value);"));
    expect(placed(text, ["computePrice"])).toEqual({ parts: { computePrice: [], rest: [] }, file: [
      ["import { round } from './money';", "shared", "computePrice", "rest"],
      ["import Tax, { rate } from './tax';", "shared", "computePrice", "rest"],
    ] });
  });

  test("keeps an import with no use at file level as unreferenced", () => {
    const text = lines("import { round } from './money';", "import { unused, other } from './unused';", "", price("return round(count);"));
    expect(placed(text, ["computePrice"]).file).toEqual([["import { unused, other } from './unused';", "unreferenced"]]);
  });

  test("finds the uses with the type checker: a local name of the same text is not a use", () => {
    const text = lines("import { round } from './money';", "",
      "export function computeInvoice(round: number): number {", "  const values = { round: 1 };", "  return values.round + round;", "}",
      "", price("return round(count);"));
    expect(placed(text, ["computePrice"]).parts).toEqual({ computePrice: ["import { round } from './money';"], rest: [] });
  });

  test("counts a shorthand property, an export list entry and a default export as uses", () => {
    const shorthand = lines("import { round } from './money';", "", invoice("return { round }.round(total);"), "",
      price("return count;"));
    const listed = lines("import { round } from './money';", "", price("return count;"), "export { round as roundPrice };");
    const exported = lines("import { round } from './money';", "", price("return count;"), "export default round;");
    for (const text of [shorthand, listed, exported])
      expect(placed(text, ["computePrice"]).parts).toEqual({ computePrice: [], rest: ["import { round } from './money';"] });
    expect(placed(exported, ["computePrice", "default"]).parts)
      .toEqual({ computePrice: [], default: ["import { round } from './money';"], rest: [] });
  });

  test("counts the export of an exported import = as a use where the declaration is", () => {
    const text = lines("export import rates = require('./rates');", "", price("return count;"));
    expect(placed(text, ["computePrice"]).parts).toEqual({ computePrice: [], rest: ["export import rates = require('./rates');"] });
  });
});

describe("partDependencies with other loading sites", () => {
  test("keeps a side-effect import and a site with a computed module name at file level as not resolved, also in a part", () => {
    const text = lines("import './setup';", "import {} from './empty';", "const plugin = process.env.PLUGIN ?? 'standard';",
      "void import('./plugins/' + plugin);", "", price("return require(`./prices/${count}`).value + require.resolve(plugin).length;"));
    expect(placed(text, ["computePrice"])).toEqual({ parts: { computePrice: [], rest: [] }, file: [
      ["import './setup';", "not-resolved"], ["import {} from './empty';", "not-resolved"],
      ["import('./plugins/' + plugin)", "not-resolved"], ["require(`./prices/${count}`)", "not-resolved"],
      ["require.resolve(plugin)", "not-resolved"],
    ] });
  });

  test("places a re-export and a site with a literal module name in the part that holds it", () => {
    const text = lines("export * from './money';", "export { rate } from './rate';",
      "export type Price = typeof import('./prices').standard;", "", invoice("return require.resolve('./invoice').length + total;"), "",
      price("return import('./tax').then((tax) => tax.add(count));", "Promise<number>"));
    expect(placed(text, ["computePrice", "Price"]).parts).toEqual({ Price: ["typeof import('./prices').standard"],
      computePrice: ["import('./tax')"], rest: ["export * from './money';", "export { rate } from './rate';",
        "require.resolve('./invoice')"] });
  });

  test("places a JavaScript require that the compiler reads as an import by the uses of its names", () => {
    const text = lines("const money = require('./money');", "const { add } = require('./tax');", "const rates = require('./rates').base;",
      "", "function computeInvoice(total) {", "  return money.round(total * rates);", "}", "", "function computePrice(count) {",
      "  return add(count, 2);", "}", "", "module.exports = { computeInvoice, computePrice, setup: require('./setup') };");
    expect(placed(text, ["computePrice"], "src/billing.js").parts).toEqual({ computePrice: ["require('./tax')"],
      rest: ["require('./money')", "require('./rates')", "require('./setup')"] });
  });

  test("lists each loading site once, in one part or at file level, and no other call", () => {
    const text = lines("import { round } from './money';", "import { rate } from './rate';", "import './setup';", "",
      invoice("return fetch('/rate').then(() => round(total * rate));"), "", price("return round(count);"));
    const { parts, fileDependencies } = place(text, ["computePrice"]);
    const listed = [...parts.flatMap(({ dependencies }) => dependencies), ...fileDependencies].map(({ node }) => node.getText());
    expect(listed.sort()).toEqual(["import './setup';", "import { rate } from './rate';", "import { round } from './money';"]);
  });
});
