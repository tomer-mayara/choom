import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { fixtureItem } from "./baseline-fixtures.ts";

/** The reviewed version 5 example: Pricing owns one symbol in a file that Billing owns by path. */
export const symbolMembershipPath = fileURLToPath(new URL("../fixtures/baseline-viewer/symbol-membership.yaml", import.meta.url));

interface SymbolSelectorRecord { path: string; symbol: string }
interface SymbolMembershipRecord {
  formatVersion: number;
  components: Array<{ id: string; membership: { value: { paths: string[]; symbols?: SymbolSelectorRecord[] } } }>;
}

export function symbolMembershipBaseline(): SymbolMembershipRecord {
  return parse(readFileSync(symbolMembershipPath, "utf8"));
}

export function pricingMembership(baseline: SymbolMembershipRecord) {
  const pricing = fixtureItem(baseline.components, 1);
  if (pricing.id !== "pricing") throw new Error("The symbol fixture needs Pricing as its second component.");
  return pricing.membership.value;
}

const pricingMembershipPath = "components.1.membership.value";

export function versionFourSymbolMembership(): { input: SymbolMembershipRecord; path: string } {
  const input = symbolMembershipBaseline();
  input.formatVersion = 4;
  pricingMembership(input).paths = ["pricing/**"];
  return { input, path: pricingMembershipPath };
}

export function invalidSymbolMembership(problem: string): { input: unknown; path: string } {
  const input = symbolMembershipBaseline();
  const membership = pricingMembership(input);
  const symbols = membership.symbols ?? [];
  const selector = fixtureItem(symbols);
  switch (problem) {
    case "a symbol path that names a subtree":
      selector.path = "billing/**";
      return { input, path: `${pricingMembershipPath}.symbols.0.path` };
    case 'a symbol path that contains "#"':
      selector.path = "billing/invoice.ts#computePrice";
      return { input, path: `${pricingMembershipPath}.symbols.0.path` };
    case "a symbol name that is not an identifier":
      selector.symbol = "compute-price";
      return { input, path: `${pricingMembershipPath}.symbols.0.symbol` };
    case "the same symbol selector twice":
      symbols.push({ ...selector });
      return { input, path: `${pricingMembershipPath}.symbols.1` };
    case "a membership with no paths or symbols":
      delete membership.symbols;
      return { input, path: pricingMembershipPath };
    default:
      throw new Error(`Unknown symbol selector example: ${problem}`);
  }
}
