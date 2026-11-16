import assert from "node:assert/strict";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import type { baselineSchema } from "@choom/baseline-model";
import { BaselineBrowserDriver } from "../support/baseline-viewer/browser-driver.ts";
import { fixtureItem } from "../support/baseline-fixtures.ts";
import {
  invalidSymbolMembership, pricingMembership, symbolMembershipBaseline, symbolMembershipPath, versionFourSymbolMembership,
} from "../support/symbol-membership-fixtures.ts";

interface SymbolMembershipWorld extends World {
  page?: Page;
  baselineInput: unknown;
  invalidBaselinePath: string;
  baselineValidation: ReturnType<typeof baselineSchema.safeParse>;
  expectedSymbols?: { path: string; symbol: string }[];
}

function page(world: SymbolMembershipWorld): Page {
  assert.ok(world.page, "The browser hook must supply a page.");
  return world.page;
}

function componentDetails(world: SymbolMembershipWorld) {
  return page(world).getByRole("dialog", { name: "Component details" });
}

Given("a version 5 baseline in which Pricing owns the symbol {string} in a shared file", function (
  this: SymbolMembershipWorld, symbol: string,
) {
  const input = symbolMembershipBaseline();
  const symbols = pricingMembership(input).symbols ?? [];
  const selector = fixtureItem(symbols);
  assert.equal(selector.symbol, symbol);
  const billingPaths = fixtureItem(input.components).membership.value.paths;
  assert.ok(billingPaths.some((path) => path.endsWith("/**") && selector.path.startsWith(path.slice(0, -2))),
    "Billing must own the shared file by its path.");
  this.baselineInput = input;
  this.expectedSymbols = structuredClone(symbols);
});

Given("a version 4 baseline in which Pricing owns the symbol {string}", function (this: SymbolMembershipWorld, symbol: string) {
  const { input, path } = versionFourSymbolMembership();
  assert.equal(fixtureItem(pricingMembership(input).symbols ?? []).symbol, symbol);
  this.baselineInput = input;
  this.invalidBaselinePath = path;
});

Given(/^an otherwise valid version 5 baseline with (.+)$/, function (this: SymbolMembershipWorld, problem: string) {
  const { input, path } = invalidSymbolMembership(problem);
  this.baselineInput = input;
  this.invalidBaselinePath = path;
});

When("the user opens the Pricing details", { timeout: 30_000 }, async function (this: SymbolMembershipWorld) {
  const browser = page(this);
  const driver = new BaselineBrowserDriver(browser);
  await driver.open();
  await driver.openBaseline(symbolMembershipPath);
  await expect(browser.getByText("Baseline ready.", { exact: true })).toBeVisible();
  await browser.getByRole("button", { name: "Pricing, pricing", exact: true }).click();
  await expect(componentDetails(this)).toBeVisible();
  await componentDetails(this).getByText("Recorded details", { exact: true }).click();
});

Then("the membership shows the file path and the symbol name", async function (this: SymbolMembershipWorld) {
  assert.ok(this.expectedSymbols?.length);
  const membership = componentDetails(this).getByRole("group", { name: "Membership", exact: true });
  const symbols = membership.getByRole("group", { name: "Symbols", exact: true });
  await expect(symbols.getByRole("list")).toBeVisible();
  await expect(symbols.getByRole("listitem")).toHaveText(this.expectedSymbols.map(({ path, symbol }) => `${symbol} in ${path}`));
});

Then("the symbol selectors are preserved", function (this: SymbolMembershipWorld) {
  assert.equal(this.baselineValidation.success, true, JSON.stringify(this.baselineValidation.error?.issues));
  assert.deepEqual(this.baselineValidation.data, this.baselineInput);
});

Then("validation names the membership selector that is not supported", function (this: SymbolMembershipWorld) {
  assert.equal(this.baselineValidation.success, false);
  const issues = this.baselineValidation.error?.issues ?? [];
  assert.ok(issues.some((issue) => issue.path.join(".") === this.invalidBaselinePath
    && issue.code === "unrecognized_keys" && issue.keys.includes("symbols")), JSON.stringify(issues));
});
