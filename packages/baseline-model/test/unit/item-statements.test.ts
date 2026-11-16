import { describe, expect, test } from "bun:test";
import { baselineStatements, documentationStatements, itemStatementFields } from "../../src/item-statements.ts";
import { baselineExample, fixtureItem, proposed } from "../../../../test/support/baseline-fixtures.ts";
import { baselineWithSignature } from "../../../../test/support/interface-documentation-fixtures.ts";

// The statements of baseline items and their paths, which the decision checks, the
// producer record checks and the viewer share.
describe("the statement fields of the items", () => {
  test("are the fields of each kind of item that hold one statement, in the order of the baseline contract", () => {
    expect<unknown>(itemStatementFields).toEqual({
      components: ["purpose", "membership", "groupingReason", "parent"],
      interfaces: ["owner", "publicAccess", "allowedConsumers", "promises"],
      resources: ["identity", "owner", "accessRules"],
      rules: ["subject", "expected", "check"],
    });
  });
});

describe("the statements of interface documentation", () => {
  test("give each path with its part, and the entry and example that hold it", () => {
    const { input, entry } = baselineWithSignature();
    const documentation = fixtureItem(input.interfaces).documentation;
    const example = fixtureItem(entry.examples);
    const path = "documentation.entries.create-invoice";
    expect(documentationStatements(documentation)).toEqual([
      { field: "documentation.summary", part: "summary", statement: documentation.summary },
      { field: `${path}.kind`, part: "kind", statement: entry.kind, entry },
      { field: `${path}.description`, part: "description", statement: entry.description, entry },
      { field: `${path}.signature`, part: "signature", statement: entry.signature, entry },
      { field: `${path}.interaction`, part: "interaction", statement: entry.interaction, entry },
      { field: `${path}.examples.valid-order.content`, part: "example", statement: example.content, entry, example },
    ]);
  });

  test("leave out a signature and an interaction that an entry does not have", () => {
    const documentation = { summary: proposed(null), sourceNotes: [], entries: [{ id: "invoice", name: "Invoice",
      accessPoint: "createInvoice", kind: proposed("type" as const), description: proposed(null), examples: [] }] };
    expect(documentationStatements(documentation).map(({ field }) => field)).toEqual(["documentation.summary",
      "documentation.entries.invoice.kind", "documentation.entries.invoice.description"]);
  });
});

describe("the statements of a baseline", () => {
  test("lists each statement with its item ID, field path and status, in the order of the baseline", () => {
    const listed = baselineStatements(baselineWithSignature().input)
      .map(({ itemId, field, statement }) => [itemId, field, statement.status]);
    const entry = "documentation.entries.create-invoice";
    expect(listed).toEqual([
      ["checkout", "purpose", "proposed"], ["checkout", "membership", "proposed"], ["checkout", "groupingReason", "accepted"],
      ["billing", "purpose", "proposed"], ["billing", "membership", "proposed"], ["billing", "groupingReason", "proposed"],
      ["invoice-api", "owner", "proposed"], ["invoice-api", "publicAccess", "proposed"],
      ["invoice-api", "allowedConsumers", "accepted"], ["invoice-api", "promises", "proposed"],
      ["invoice-api", "documentation.summary", "proposed"], ["invoice-api", `${entry}.kind`, "proposed"],
      ["invoice-api", `${entry}.description`, "proposed"], ["invoice-api", `${entry}.signature`, "accepted"],
      ["invoice-api", `${entry}.interaction`, "proposed"], ["invoice-api", `${entry}.examples.valid-order.content`, "proposed"],
      ["invoice-store", "identity", "proposed"], ["invoice-store", "owner", "proposed"], ["invoice-store", "accessRules", "proposed"],
      ["invoice-access", "subject", "proposed"], ["invoice-access", "expected", "proposed"], ["invoice-access", "check", "proposed"],
    ]);
  });

  test("a component parent is a statement only when the component has one", () => {
    const baseline = baselineExample();
    Object.assign(fixtureItem(baseline.components, 1), { parent: proposed("checkout") });
    expect(baselineStatements(baseline).filter(({ field }) => field === "parent").map(({ itemId }) => itemId)).toEqual(["billing"]);
  });

  test("returns the statements of the baseline itself", () => {
    const baseline = baselineExample();
    const listed = baselineStatements(baseline).find(({ itemId, field }) => itemId === "billing" && field === "purpose");
    expect(listed?.statement).toBe(fixtureItem(baseline.components, 1).purpose);
  });
});
