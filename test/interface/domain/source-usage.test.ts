import { expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { stringify } from "yaml";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import { baselineSchema } from "../../../src/domain/baseline.ts";
import { baselineCodec } from "../../../src/lib/baseline-yaml.ts";
import { sourceUsageBaseline } from "../../support/source-usage-fixtures.ts";

const structure = addFormats(new Ajv2020({ schemas: [contracts], ownProperties: true })).compile({ $ref: "Baseline.json" });

test("version 3 preserves source observations without rewriting permission", () => {
  const input = sourceUsageBaseline();
  expect(structure(input)).toBe(true);
  expect(baselineSchema.parse(input)).toEqual(input);
  expect(baselineCodec.decode(stringify(input))).toMatchObject({ status: "success", baseline: input });
});

test.each([1, 2])("sourceUsage remains forbidden in version %i", (version) => {
  const input = { ...sourceUsageBaseline(), formatVersion: version };
  if (version === 1) for (const item of input.interfaces) Reflect.deleteProperty(item, "documentation");
  expect(structure(input)).toBe(false);
  expect(baselineSchema.safeParse(input).success).toBe(false);
});

test("version 3 allows absent source usage and rejects future versions", () => {
  const { sourceUsage: _sourceUsage, ...input } = sourceUsageBaseline();
  expect(structure(input)).toBe(true);
  expect(baselineSchema.parse(input)).toEqual(input);
  expect(baselineCodec.decode(stringify({ ...input, formatVersion: 4 }))).toMatchObject({
    status: "failure", code: "unsupported-version",
  });
});

test.each(["root", "assessment", "use", "note", "location"])("new %s objects reject undeclared keys", (target) => {
  const input = sourceUsageBaseline();
  const assessment = input.sourceUsage.assessments[0];
  if (!assessment) throw new Error("Missing assessment fixture");
  const targets = { root: input.sourceUsage, assessment, use: assessment.uses[0], note: assessment.sourceNotes[0], location: assessment.sourceNotes[0]?.location };
  const record = targets[target as keyof typeof targets];
  if (!record) throw new Error("Missing record fixture");
  Object.assign(record, { invented: true });
  expect(structure(input)).toBe(false);
  expect(baselineSchema.safeParse(input).success).toBe(false);
});

test("source-use failures name the owned field without echoing unknown input keys", () => {
  const input = sourceUsageBaseline();
  Object.assign(input.sourceUsage, { "private-input-key": "private-input-value" });
  const result = baselineCodec.decode(stringify(input));
  expect(result).toMatchObject({ status: "failure", code: "invalid-document" });
  if (result.status === "failure") {
    expect(result.message).toContain("sourceUsage");
    expect(result.message).not.toContain("private-input");
  }
});
