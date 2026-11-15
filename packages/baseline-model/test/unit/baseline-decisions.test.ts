import { describe, expect, test } from "bun:test";
import { baselineStatements, type SavedBaseline, validateDecisions } from "../../src/baseline-decisions.ts";
import type { Baseline, BaselineDecision, BaselineDecisionValue } from "../../src/generated/contracts.ts";
import { baselineExample, fixtureItem, proposed } from "../../../../test/support/baseline-fixtures.ts";
import { baselineWithSignature } from "../../../../test/support/interface-documentation-fixtures.ts";

// The checks of a decision file against one saved baseline. The caller gives the
// SHA-256 of the saved baseline file; the checks read no file.
const digest = "0123456789abcdef".repeat(4);

function saved(baseline: Baseline = baselineExample()): SavedBaseline {
  return { baseline, sha256: digest };
}

function decisionFile(entries: BaselineDecision[], change: Record<string, unknown> = {}): Record<string, unknown> {
  return { formatVersion: 1, id: "decisions-001", baselineRef: "baseline-example", baselineDigest: digest,
    decider: { name: "Ada Example", kind: "human" }, decidedAt: "2026-11-15T10:30:00Z", entries, ...change };
}

const accept = (itemId: string, field: string): BaselineDecision => ({ action: "accept", itemId, field });
const correct = (itemId: string, field: string, oldValue: BaselineDecisionValue, newValue: BaselineDecisionValue):
  BaselineDecision => ({ action: "correct", itemId, field, oldValue, newValue });

function problems(input: unknown, baseline?: Baseline): readonly string[] {
  const outcome = validateDecisions(input, saved(baseline));
  return outcome.status === "invalid" ? outcome.problems : [];
}

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

describe("decisions that the checks accept", () => {
  test("accept and correct entries for proposed statements", () => {
    const input = decisionFile([accept("billing", "purpose"), accept("invoice-store", "owner"),
      correct("billing", "groupingReason", "Invoice rules change together", "Invoice and tax rules change together"),
      correct("invoice-api", "owner", "billing", "checkout")]);
    expect<unknown>(validateDecisions(input, saved())).toEqual({ status: "valid", decisions: input });
  });

  test("decisions about documentation statements, with the field paths of the record format", () => {
    const { input: baseline } = baselineWithSignature();
    const entry = "documentation.entries.create-invoice";
    const input = decisionFile([accept("invoice-api", "documentation.summary"),
      accept("invoice-api", `${entry}.examples.valid-order.content`),
      correct("invoice-api", `${entry}.description`, "Validate an order and create its invoice.", null)]);
    expect(validateDecisions(input, saved(baseline)).status).toBe("valid");
  });

  test("an old value that is the same JSON data with its keys in another order", () => {
    const promises = { lifecycle: null, errors: null, data: null, behavior: "Create an invoice" };
    const input = decisionFile([correct("invoice-api", "promises", promises, { ...promises, errors: "Reject an empty order." })]);
    expect(validateDecisions(input, saved()).status).toBe("valid");
  });

  test("a rule value with a reserved key, which the decisions keep", () => {
    const newValue = JSON.parse('{"__proto__":{"recorded":true},"expression":"Only checkout"}') as BaselineDecisionValue;
    const input = decisionFile([correct("invoice-access", "expected",
      { expression: "Only permitted consumers may use Invoice API" }, newValue)]);
    const outcome = validateDecisions(input, saved());
    expect(outcome.status).toBe("valid");
    const kept = outcome.status === "valid" ? fixtureItem(outcome.decisions.entries) : undefined;
    expect(kept?.action === "correct" && Object.hasOwn(kept.newValue as object, "__proto__")).toBe(true);
  });

  test("the checks change neither the baseline nor the decision file", () => {
    const baseline = baselineExample();
    const input = decisionFile([correct("billing", "purpose", "Prepare invoices", "Prepare and send invoices")]);
    const [baselineBefore, inputBefore] = [structuredClone(baseline), structuredClone(input)];
    validateDecisions(input, saved(baseline));
    expect([baseline, input]).toEqual([baselineBefore, inputBefore]);
  });
});

describe("decisions that do not belong to the saved baseline", () => {
  test("a decision file of another shape names the field and stops the other checks", () => {
    const input = decisionFile([{ action: "reject", itemId: "payments", field: "purpose" } as never], { baselineRef: "other" });
    expect(problems(input)).toEqual([expect.stringMatching(/^The decision file is invalid at entries\.0\.action: /)]);
    expect(problems([input])).toEqual([expect.stringMatching(/^The decision file is invalid: /)]);
  });

  test("decisions for another baseline ID", () => {
    expect(problems(decisionFile([accept("billing", "purpose")], { baselineRef: "baseline-other" }))).toEqual([
      "The decision file is for baseline baseline-other, but the saved baseline is baseline-example.",
    ]);
  });

  test("decisions whose digest is not the SHA-256 of the saved baseline file, without the entry checks", () => {
    const other = "f".repeat(64);
    expect(problems(decisionFile([accept("payments", "purpose")], { baselineDigest: other }))).toEqual([
      `The decision file gives the baseline digest ${other}, but the SHA-256 of the saved baseline file is ${digest}.`,
    ]);
  });
});

describe("entries that do not name one proposed statement", () => {
  test.each([
    ["an item that the baseline does not have", "payments", "purpose"],
    ["a field name with a typing error", "billing", "purpos"],
    ["the name of an item", "billing", "name"],
    ["the ID of an item", "billing", "id"],
    ["the value of a statement", "billing", "purpose.value"],
    ["a fact in a statement value", "invoice-api", "promises.behavior"],
    ["a field of another kind of item", "invoice-api", "purpose"],
    ["an absent component parent", "billing", "parent"],
    ["documentation that version 1 does not have", "invoice-api", "documentation.summary"],
  ])("refuses %s", (_name, itemId, field) => {
    expect(problems(decisionFile([accept(itemId, field)]))).toEqual([
      `entries.0: ${itemId}.${field} is not a statement of baseline baseline-example.`,
    ]);
  });

  test("refuses the documentation object and an entry of it, which are not statements", () => {
    const { input: baseline } = baselineWithSignature();
    const fields = ["documentation", "documentation.entries.create-invoice", "documentation.entries.create-invoice.examples"];
    expect(problems(decisionFile(fields.map((field) => accept("invoice-api", field))), baseline)).toEqual(fields.map((field, index) =>
      `entries.${index}: invoice-api.${field} is not a statement of baseline baseline-example.`));
  });

  test("refuses a second entry for the same statement, also with another action", () => {
    const input = decisionFile([accept("billing", "purpose"), accept("billing", "membership"),
      correct("billing", "purpose", "Prepare invoices", "Prepare and send invoices"), accept("billing", "membership")]);
    expect(problems(input)).toEqual([
      "entries.2: billing.purpose already has a decision in entries.0. Give one entry for each statement.",
      "entries.3: billing.membership already has a decision in entries.1. Give one entry for each statement.",
    ]);
  });

  test("refuses an entry for a statement that is accepted already, and names its acceptance reference", () => {
    const { input: baseline } = baselineWithSignature();
    const input = decisionFile([accept("checkout", "groupingReason"),
      correct("invoice-api", "documentation.entries.create-invoice.signature", "createInvoice(\n  order: Order,\n): Promise<Invoice>",
        "createInvoice(order: Order): Promise<Invoice>")]);
    expect(problems(input, baseline)).toEqual([
      "entries.0: checkout.groupingReason is accepted already (acceptanceRef missing-review#/decisions/4). " +
        "Only a proposed statement can be decided.",
      "entries.1: invoice-api.documentation.entries.create-invoice.signature is accepted already " +
        "(acceptanceRef missing-review#/decisions/4). Only a proposed statement can be decided.",
    ]);
  });
});
