import { baselineExample, fixtureItem, proposed } from "./baseline-fixtures.ts";

export function enrichedBaseline() {
  const baseline = baselineExample();
  const item = fixtureItem(baseline.interfaces);
  return {
    ...baseline, formatVersion: 2 as const,
    interfaces: [{
      ...item,
      documentation: {
        summary: proposed("Create an invoice from an order."),
        entries: [{
          id: "create-invoice", name: "Create invoice", accessPoint: "createInvoice",
          kind: proposed("function" as const), description: proposed("Validate an order and create its invoice."),
          interaction: proposed({
            input: "An order with at least one item.", success: "An invoice with a stable ID.",
            failures: "Reject an empty order.", effects: "Save the invoice once validation succeeds.",
          }),
          examples: [{
            id: "valid-order", name: "A valid order", basis: "source-reviewed" as const,
            content: {
              ...proposed({
                text: "createInvoice(order)", input: '{"items":[{"quantity":1}]}',
                result: { text: '{"id":"invoice-1"}', summary: "The saved invoice has an ID.", scope: "excerpt" as const },
              }),
              evidenceRefs: ["reviewed-invoice-source"],
            },
          }],
        }],
        sourceNotes: [{
          evidenceRef: "reviewed-invoice-source", description: "Invoice validation and result construction.",
          location: { snapshotRef: "snapshot-invoice", path: "billing/invoice.ts", sha256: "a".repeat(64), lines: [1, 12] },
        }],
      },
    }],
  };
}

export function invalidDocumentation(defect: string): unknown {
  const input = enrichedBaseline();
  const item = fixtureItem(input.interfaces);
  const entry = fixtureItem(item.documentation.entries);
  const example = fixtureItem(entry.examples);
  const note = fixtureItem(item.documentation.sourceNotes);
  switch (defect) {
    case "duplicate entry ID": item.documentation.entries.push(structuredClone(entry)); break;
    case "unknown access point": entry.accessPoint = "otherInterface"; break;
    case "interaction on a type": Object.assign(entry.kind, { value: "type" }); break;
    case "unknown example basis": Object.assign(example, { basis: "executed" }); break;
    case "unknown result scope": Object.assign(example.content.value.result, { scope: "partial" }); break;
    case "uncited source note": note.evidenceRef = "unused-source"; break;
    case "reversed source range": note.location.lines = [12, 1]; break;
    case "missing reviewed location": Object.assign(note, { location: undefined }); break;
    case "another statement's source note":
      item.documentation.summary.evidenceRefs = [note.evidenceRef];
      example.content.evidenceRefs = ["different-source"];
      break;
    default: throw new Error(`Unknown documentation defect: ${defect}`);
  }
  return input;
}

export function documentationAtBudget(bytes: number) {
  const input = enrichedBaseline();
  const docs = fixtureItem(input.interfaces).documentation;
  const original = fixtureItem(docs.entries);
  const sample = fixtureItem(original.examples);
  docs.entries = Array.from({ length: 32 }, (_, index) => ({
    ...structuredClone(original), id: `entry-${index}`,
    examples: Array.from({ length: 8 }, (_, exampleIndex) => ({
      ...structuredClone(sample), id: `example-${exampleIndex}`,
      content: { ...structuredClone(sample.content), value: { ...structuredClone(sample.content.value), text: "x" } },
    })),
  }));
  let remaining = bytes - new TextEncoder().encode(JSON.stringify([docs])).byteLength;
  for (const entry of docs.entries) for (const example of entry.examples) {
    const addition = Math.min(Math.max(remaining, 0), 16 * 1024 - 1);
    example.content.value.text += "x".repeat(addition);
    remaining -= addition;
  }
  if (remaining !== 0) throw new Error("The requested documentation budget is outside the fixture range.");
  return input;
}

export function excessiveDocumentation(limit: string) {
  if (limit === "total documentation bytes") return documentationAtBudget(2 * 1024 * 1024 + 1);
  const input = enrichedBaseline();
  const docs = fixtureItem(input.interfaces).documentation;
  const entry = fixtureItem(docs.entries);
  switch (limit) {
    case "entries per interface":
      docs.entries = Array.from({ length: 33 }, (_, index) => ({ ...structuredClone(entry), id: `entry-${index}` }));
      break;
    case "examples per entry":
      entry.examples = Array.from({ length: 9 }, (_, index) => ({ ...structuredClone(fixtureItem(entry.examples)), id: `example-${index}` }));
      break;
    case "descriptive text bytes": docs.summary.value = "é".repeat(4096) + "x"; break;
    case "sample text bytes": fixtureItem(entry.examples).content.value.text = "é".repeat(8192) + "x"; break;
    default: throw new Error(`Unknown documentation limit: ${limit}`);
  }
  return input;
}
