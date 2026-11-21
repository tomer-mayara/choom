import { describe, expect, test } from "bun:test";
import { SubjectItems } from "../../src/subject-items.ts";

// The rule of the viewer for the subject references of discovery questions and
// gaps. The viewer placement and the producer record checks use it.
const item = (id: string): { id: string } => ({ id });
const items = new SubjectItems({ components: [item("billing"), item("billing-core")], interfaces: [item("orders-api")],
  resources: [item("invoices")], rules: [item("billing-owns-invoices")] });

describe("the items that a subject reference names", () => {
  test.each([
    ["the ID of a component", "billing", "billing"],
    ["a field of a component", "billing.purpose", "billing"],
    ["a field below a field of an interface", "orders-api.documentation.entries.list-orders.signature", "orders-api"],
    ["the ID of an interface", "orders-api", "orders-api"],
    ["a field of a resource", "invoices.owner", "invoices"],
    ["a field of a rule", "billing-owns-invoices.check", "billing-owns-invoices"],
    ["a field of an item whose ID starts with another item ID", "billing-core.purpose", "billing-core"],
    // A file name with a dot names the item before the dot, as the viewer places it.
    ["a file name whose text before the first dot is an item ID", "billing.ts", "billing"],
  ])("a reference that is %s names that item", (_name, reference, id) => {
    expect(items.namedItem(reference)).toBe(id);
  });

  test.each([
    ["starts with an item ID but not with the ID and a dot", "billing-api.owner"],
    ["is longer than an item ID", "billingx"],
    ["has another case", "Billing.purpose"],
    ["is a path in a folder", "src/billing/invoice.ts"],
    ["starts with a dot", ".billing"],
    ["is empty", ""],
  ])("a reference that %s names no item", (_name, reference) => {
    expect(items.namedItem(reference)).toBeUndefined();
  });
});
