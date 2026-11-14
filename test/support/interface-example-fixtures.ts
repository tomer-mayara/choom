import { accepted, fixtureItem, proposed } from "./baseline-fixtures.ts";
import { interfaceOverviewFixture } from "./interface-overview-fixtures.ts";

export const failureExampleText = "createInvoice({ items: [] })\n";
export const literalExampleText = '<img src="https://example.invalid/not-loaded" onerror="alert(1)">\nrm -rf ./example-only\n';

export function interfaceExampleFixture() {
  const baseline = interfaceOverviewFixture();
  if (baseline.formatVersion !== 2) throw new Error("Example fixtures need baseline version 2.");
  const documentation = fixtureItem(baseline.interfaces).documentation;
  if (!documentation) throw new Error("Example fixtures need documented entries.");
  fixtureItem(documentation.entries).examples.push(
    { id: "empty-order", name: "An empty order", basis: "illustrative", content: accepted({
      text: failureExampleText, input: '{"items":[]}',
      result: { text: '{"error":"Order has no items"}', summary: "The order is rejected because it has no items.", scope: "excerpt" },
    }) },
    { id: "literal-sample", name: "Literal sample", basis: "illustrative", content: proposed({ text: literalExampleText }) },
  );
  fixtureItem(documentation.entries, 2).examples = [
    { id: "valid-order", name: "Saved invoice", basis: "illustrative", content: proposed({ text: '{"id":"saved-invoice"}\n' }) },
  ];
  return baseline;
}
