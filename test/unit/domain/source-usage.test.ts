import { expect, test } from "bun:test";
import { baselineSchema } from "../../../src/domain/baseline.ts";
import { fixtureItem } from "../../support/baseline-fixtures.ts";
import { baselineWithSignature, invalidDocumentation } from "../../support/interface-documentation-fixtures.ts";
import { invalidSourceUsage, sourceUsageBaseline } from "../../support/source-usage-fixtures.ts";

test.each([
  "duplicate interface assessments", "duplicate use IDs", "a missing component", "a missing interface",
  "a blank mapping reference", "an unlocated caller", "unlocated binding evidence", "a fragmented use reference",
  "a different source snapshot", "conflicting entry and access bindings", "an unsupported kind", "an unsupported context",
  "invalid inherited documentation",
])("rejects %s at the affected field", (defect) => {
  const { input, path } = invalidSourceUsage(defect);
  const result = baselineSchema.safeParse(input);
  expect(result.success).toBe(false);
  expect(result.error?.issues.some((issue) => issue.path.join(".").startsWith(path))).toBe(true);
});

test.each([
  "missing caller evidence", "duplicate use evidence", "duplicate scope evidence", "duplicate notes", "uncited note",
  "unknown entry", "unknown access", "blank optional entry", "blank optional access",
])("rejects %s without discarding the record", (defect) => {
  const input = sourceUsageBaseline();
  const assessment = fixtureItem(input.sourceUsage.assessments);
  const use = fixtureItem(assessment.uses);
  switch (defect) {
    case "missing caller evidence": use.callerRef = "not-cited"; break;
    case "duplicate use evidence": use.evidenceRefs.push(use.callerRef); break;
    case "duplicate scope evidence": assessment.evidenceRefs.push(fixtureItem(assessment.evidenceRefs)); break;
    case "duplicate notes": assessment.sourceNotes.push(structuredClone(fixtureItem(assessment.sourceNotes))); break;
    case "uncited note": fixtureItem(assessment.sourceNotes).evidenceRef = "not-cited"; break;
    case "unknown entry": use.entryId = "missing"; break;
    case "unknown access": use.accessPoint = "missing"; break;
    case "blank optional entry": use.entryId = " "; break;
    case "blank optional access": use.accessPoint = " "; break;
  }
  expect(baselineSchema.safeParse(input).success).toBe(false);
});

test("unmapped, unknown-context, and scoped-empty records are preserved", () => {
  const input = sourceUsageBaseline();
  const assessment = fixtureItem(input.sourceUsage.assessments);
  const use = fixtureItem(assessment.uses);
  use.consumerId = null;
  use.context = "unknown";
  use.description = "Caller ownership and application context are unresolved.";
  Reflect.deleteProperty(use, "entryId");
  Reflect.deleteProperty(use, "accessPoint");
  expect(baselineSchema.parse(input)).toEqual(input);
  assessment.uses = [];
  expect(baselineSchema.parse(input)).toEqual(input);
  input.sourceUsage.assessments = [];
  expect(baselineSchema.parse(input)).toEqual(input);
});

test("IDs are local to their assessment and scope evidence may be unlocated", () => {
  const input = sourceUsageBaseline();
  const assessment = fixtureItem(input.sourceUsage.assessments);
  const second = structuredClone(fixtureItem(input.interfaces));
  second.id = "another-interface";
  input.interfaces.push(second);
  input.sourceUsage.assessments.push({ ...structuredClone(assessment), interfaceId: second.id });
  assessment.evidenceRefs.push("query#/callers");
  const scopeNote = { ...structuredClone(fixtureItem(assessment.sourceNotes)), evidenceRef: "query#/callers", description: "Query used to find candidate files." };
  Reflect.deleteProperty(scopeNote, "location");
  assessment.sourceNotes.push(scopeNote);
  expect(baselineSchema.parse(input)).toEqual(input);
});

test.each(["../secret", "/absolute", "C:/absolute", "src\\secret", "src/./file", "src/\u0000file"])("source-use paths reject %s", (path) => {
  const input = sourceUsageBaseline();
  fixtureItem(fixtureItem(input.sourceUsage.assessments).sourceNotes).location.path = path;
  expect(baselineSchema.safeParse(input).success).toBe(false);
});

test.each([
  "duplicate entry ID", "unknown access point", "interaction on a type", "uncited source note",
  "missing reviewed location", "another statement's source note",
])("version 3 inherits documentation rejection for %s", (defect) => {
  const invalid = invalidDocumentation(defect);
  expect(baselineSchema.safeParse({ ...(invalid as object), formatVersion: 3 as const }).success).toBe(false);
});

test("version 3 retains signatures and rejects signatures on non-functions", () => {
  const { input, entry } = baselineWithSignature();
  const v3 = { ...input, formatVersion: 3 as const };
  expect(baselineSchema.parse(v3)).toEqual(v3);
  Object.assign(entry.kind, { value: "type" });
  Reflect.deleteProperty(entry, "interaction");
  expect(baselineSchema.safeParse(v3).success).toBe(false);
});
