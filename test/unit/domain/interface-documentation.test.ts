import { expect, test } from "bun:test";
import { baselineSchema } from "../../../src/domain/baseline.ts";
import { fixtureItem } from "../../support/baseline-fixtures.ts";
import { enrichedBaseline, invalidDocumentation } from "../../support/interface-documentation-fixtures.ts";

test.each([
  "duplicate entry ID", "unknown access point", "interaction on a type", "uncited source note",
  "reversed source range", "missing reviewed location", "another statement's source note",
])("documentation rejects %s with a local field path", (defect) => {
  const result = baselineSchema.safeParse(invalidDocumentation(defect));
  expect(result.success).toBe(false);
  expect(result.error?.issues.some((issue) => issue.path.slice(0, 3).join(".") === "interfaces.0.documentation")).toBe(true);
});

test("entry and example IDs are local rather than architecture IDs", () => {
  const input = enrichedBaseline();
  const item = fixtureItem(input.interfaces);
  const first = fixtureItem(item.documentation.entries);
  first.id = item.id;
  const second = { ...structuredClone(first), id: "second" };
  item.documentation.entries.push(second);
  input.interfaces.push({ ...structuredClone(item), id: "second-interface" });
  expect(baselineSchema.parse(input)).toEqual(input);
});

test("example IDs and source-note references must be unique within their owners", () => {
  const input = enrichedBaseline();
  const docs = fixtureItem(input.interfaces).documentation;
  const entry = fixtureItem(docs.entries);
  entry.examples.push(structuredClone(fixtureItem(entry.examples)));
  docs.sourceNotes.push(structuredClone(fixtureItem(docs.sourceNotes)));
  const result = baselineSchema.safeParse(input);
  expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual(expect.arrayContaining([
    "interfaces.0.documentation.entries.0.examples.1.id", "interfaces.0.documentation.sourceNotes.1.evidenceRef",
  ]));
});

test.each(["../secret", "/absolute", "C:/absolute", "src\\secret", "src/./file", "src/\u0000file"])(
  "source paths cannot leave a saved snapshot: %s", (path) => {
    const input = enrichedBaseline();
    fixtureItem(fixtureItem(input.interfaces).documentation.sourceNotes).location.path = path;
    expect(baselineSchema.safeParse(input).success).toBe(false);
  },
);

test("an unlocated note may describe an existing artifact reference", () => {
  const input = enrichedBaseline();
  const docs = fixtureItem(input.interfaces).documentation;
  Object.assign(docs, { sourceNotes: [...docs.sourceNotes, {
    evidenceRef: fixtureItem(docs.summary.evidenceRefs), description: "Analysis context.",
  }] });
  expect(baselineSchema.parse(input)).toEqual(input);
});
