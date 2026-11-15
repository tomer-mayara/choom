import { describe, expect, test } from "bun:test";
import { baselineSchema } from "../../src/baseline.ts";
import { baselineExample, fixtureItem } from "../../../../test/support/baseline-fixtures.ts";
import { pricingMembership, symbolMembershipBaseline } from "../../../../test/support/symbol-membership-fixtures.ts";

const pricingPath = "components.1.membership.value";

function issuePaths(input: unknown): string[] {
  const result = baselineSchema.safeParse(input);
  expect(result.success).toBe(false);
  return result.error?.issues.map((issue) => issue.path.join(".")) ?? [];
}

function withPricingSymbol(change: Partial<{ path: string; symbol: string }>) {
  const input = symbolMembershipBaseline();
  Object.assign(fixtureItem(pricingMembership(input).symbols ?? []), change);
  return input;
}

describe("version 5 symbol selectors", () => {
  test("keep a component that owns only symbols without resolving ownership", () => {
    const input = symbolMembershipBaseline();
    expect(pricingMembership(input).paths).toEqual([]);
    expect(baselineSchema.parse(input)).toEqual(input);
  });

  test("keep paths, exclusions, and symbols in saved order", () => {
    const input = symbolMembershipBaseline();
    Object.assign(pricingMembership(input), {
      paths: ["pricing/**"], excludePaths: ["pricing/generated/**"],
      symbols: [
        { path: "billing/invoice.ts", symbol: "computePrice" }, { path: "billing/invoice.ts", symbol: "default" },
        { path: "billing/tax.ts", symbol: "computePrice" },
      ],
    });
    expect(baselineSchema.parse(input)).toEqual(input);
  });

  test("keep a version 5 membership with paths only or with an empty symbol list", () => {
    const input = symbolMembershipBaseline();
    const membership = pricingMembership(input);
    membership.paths = ["pricing/**"];
    delete membership.symbols;
    expect(baselineSchema.parse(input)).toEqual(input);
    membership.symbols = [];
    expect(baselineSchema.parse(input)).toEqual(input);
  });

  test.each([
    "computePrice", "default", "_private", "$store", "a1", "Ünïcode", "日本語", "ಠ_ಠ", "x\u200Cy", "℘", "class",
  ])("accept the identifier name %j", (symbol) => {
    const input = withPricingSymbol({ symbol });
    expect(baselineSchema.parse(input)).toEqual(input);
  });

  test.each([
    "", " ", "compute-price", "1price", "price list", "billing.computePrice", "#computePrice", "\\u0061bc",
    "compute\u0000", "a\u200Bb", "😀", "default ", " default",
  ])("reject the symbol name %j", (symbol) => {
    expect(issuePaths(withPricingSymbol({ symbol }))).toContain(`${pricingPath}.symbols.0.symbol`);
  });

  test.each([
    "billing/**", "billing/invoice.ts#computePrice", "billing#folder/invoice.ts", "/billing/invoice.ts", "C:/invoice.ts",
    "billing\\invoice.ts", "../invoice.ts", "./invoice.ts", "billing/../invoice.ts", "billing//invoice.ts", "billing/",
    "billing/*.ts", "billing/[x].ts", "billing/{x}.ts", "billing/?.ts", "**", "", " ", "billing/\u0000.ts",
  ])("reject the symbol path %j", (path) => {
    expect(issuePaths(withPricingSymbol({ path }))).toContain(`${pricingPath}.symbols.0.path`);
  });

  test("reject a repeated symbol selector at its second position", () => {
    const input = symbolMembershipBaseline();
    const symbols = pricingMembership(input).symbols ?? [];
    symbols.push({ path: "billing/tax.ts", symbol: "computePrice" }, { ...fixtureItem(symbols) });
    expect(issuePaths(input)).toEqual([`${pricingPath}.symbols.2`]);
  });

  test.each([
    { paths: [] }, { paths: [], symbols: [] }, { paths: [], excludePaths: ["billing/generated/**"], symbols: [] },
  ])("reject a membership without a path or symbol: %j", (value) => {
    const input = symbolMembershipBaseline();
    Object.assign(fixtureItem(input.components, 1).membership, { value });
    expect(issuePaths(input)).toEqual([pricingPath]);
  });

  test.each([
    { path: "billing/invoice.ts" }, { symbol: "computePrice" },
    { path: "billing/invoice.ts", symbol: "computePrice", kind: "function" },
  ])("reject a symbol selector with other fields: %j", (selector) => {
    const input = symbolMembershipBaseline();
    Object.assign(pricingMembership(input), { symbols: [selector] });
    expect(baselineSchema.safeParse(input).success).toBe(false);
  });

  test("still apply the path selector rules to paths and exclusions", () => {
    const input = symbolMembershipBaseline();
    Object.assign(pricingMembership(input), { paths: ["pricing/*.ts"], excludePaths: ["pricing/a.ts#price"] });
    expect(issuePaths(input)).toEqual([`${pricingPath}.paths.0`, `${pricingPath}.excludePaths.0`]);
  });
});

describe("versions 1 to 4", () => {
  test.each([1, 2, 3, 4])("version %i refuses a symbol list", (formatVersion) => {
    const input = { ...baselineExample(), formatVersion };
    Object.assign(fixtureItem(input.components).membership.value, { symbols: [{ path: "checkout/order.ts", symbol: "createOrder" }] });
    expect(issuePaths(input)).toEqual(["components.0.membership.value"]);
  });

  test.each([1, 2, 3, 4])("version %i still needs at least one path", (formatVersion) => {
    const input = { ...baselineExample(), formatVersion };
    fixtureItem(input.components).membership.value.paths = [];
    expect(issuePaths(input)).toEqual(["components.0.membership.value.paths"]);
  });
});
