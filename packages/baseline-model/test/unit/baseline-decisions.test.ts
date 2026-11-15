import { describe, expect, test } from "bun:test";
import { type SavedBaseline, validateDecisions } from "../../src/baseline-decisions.ts";
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

describe("corrections", () => {
  test("refuse an old value that is not the current value, and name the statement, the expected and the given value", () => {
    expect(problems(decisionFile([correct("billing", "purpose", "Prepare the invoices", "Send invoices")]))).toEqual([
      'entries.0: the old value of billing.purpose is not the current value. Expected oldValue: "Prepare invoices". ' +
        'Given oldValue: "Prepare the invoices".',
    ]);
  });

  test.each<[string, string, string, BaselineDecisionValue]>([
    ["the old value of another statement", "billing", "purpose", "Invoice rules change together"],
    ["text for a list", "invoice-api", "publicAccess", "createInvoice"],
    ["a number for text", "billing", "purpose", 1],
    ["null for an empty object", "invoice-access", "subject", null],
    ["an object with one more key", "invoice-access", "expected", { expression: "Only permitted consumers may use Invoice API", x: 1 }],
    ["a list in another order", "billing", "membership", { paths: ["billing/tax.ts", "billing/invoice.ts"] }],
  ])("compare the old value as JSON data: they refuse %s", (_name, itemId, field, oldValue) => {
    const baseline = baselineExample();
    fixtureItem(baseline.components, 1).membership.value.paths.push("billing/tax.ts");
    const found = problems(decisionFile([correct(itemId, field, oldValue, "Changed")]), baseline);
    expect(found).toEqual([expect.stringContaining(`entries.0: the old value of ${itemId}.${field} is not the current value.`)]);
  });

  test("refuse a correction whose new value is the current value, also with the keys in another order", () => {
    const promises = { behavior: "Create an invoice", data: null, errors: null, lifecycle: null };
    const input = decisionFile([correct("billing", "purpose", "Prepare invoices", "Prepare invoices"),
      correct("invoice-api", "promises", promises, { lifecycle: null, errors: null, data: null, behavior: "Create an invoice" })]);
    expect(problems(input)).toEqual([
      "entries.0: the correction of billing.purpose gives the current value as the new value. Use accept to keep a value.",
      "entries.1: the correction of invoice-api.promises gives the current value as the new value. Use accept to keep a value.",
    ]);
  });

  test.each<[string, BaselineDecision, string]>([
    ["blank text", correct("billing", "purpose", "Prepare invoices", " "), "components.1.purpose.value (component billing)"],
    ["null for a required text", correct("billing", "purpose", "Prepare invoices", null),
      "components.1.purpose.value (component billing)"],
    ["an unknown owner", correct("invoice-api", "owner", "billing", "payments"), "interfaces.0.owner.value (interface invoice-api)"],
    ["a path selector with #", correct("billing", "membership", { paths: ["billing/invoice.ts"] },
      { paths: ["billing/invoice.ts#create"] }), "components.1.membership.value.paths.0 (component billing)"],
    ["rule data that is not an object", correct("invoice-access", "check", null, ["run the check"]),
      "rules.0.check.value (rule invoice-access)"],
  ])("refuse a new value that the baseline rules refuse: %s", (_name, entry, place) => {
    const found = problems(decisionFile([entry]));
    expect(found).toEqual([expect.stringMatching(new RegExp(`^After the corrections, the baseline is invalid at ${
      place.replaceAll(".", "\\.").replaceAll("(", "\\(").replaceAll(")", "\\)")}: .`))]);
  });

  test("check the new values together: two parents that are each valid make a cycle", () => {
    const baseline = baselineExample();
    for (const component of baseline.components) Object.assign(component, { parent: proposed(null) });
    const input = decisionFile([correct("checkout", "parent", null, "billing"), correct("billing", "parent", null, "checkout")]);
    expect(problems(decisionFile([fixtureItem(input.entries as BaselineDecision[])]), baseline)).toEqual([]);
    expect(problems(input, baseline)).toContain(
      "After the corrections, the baseline is invalid at components.0.parent.value (component checkout): " +
        "Component parents must not form a cycle.");
  });

  test("report the problems of all entries, and check the new values only when every entry is correct", () => {
    const input = decisionFile([accept("payments", "purpose"), correct("billing", "purpose", "Prepare invoices", " "),
      correct("billing", "groupingReason", "Invoices", "Tax"), accept("payments", "purpose")]);
    expect(problems(input)).toEqual([
      "entries.0: payments.purpose is not a statement of baseline baseline-example.",
      'entries.2: the old value of billing.groupingReason is not the current value. Expected oldValue: ' +
        '"Invoice rules change together". Given oldValue: "Invoices".',
      "entries.3: payments.purpose is not a statement of baseline baseline-example.",
    ]);
  });

  test("shorten a long value in a message after 200 characters", () => {
    const current = "Prepare invoices".padEnd(300, "x");
    const baseline = baselineExample();
    fixtureItem(baseline.components, 1).purpose.value = current;
    const [found] = problems(decisionFile([correct("billing", "purpose", "Other", "New")]), baseline);
    expect(found).toEndWith(`Expected oldValue: ${JSON.stringify(current).slice(0, 200)}.... Given oldValue: "Other".`);
  });
});
