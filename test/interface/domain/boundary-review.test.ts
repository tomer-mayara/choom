import { expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import { baselineSchema } from "@choom/baseline-model";
import { baselineCodec } from "../../../src/lib/baseline-yaml.ts";
import { boundaryBytes, boundaryFixture } from "../../support/boundary-baseline.ts";

const validate = addFormats(new Ajv2020({ schemas: [contracts], ownProperties: true })).compile({ $ref: "Baseline.json" });

test.each(["before", "after", "partial", "policy"] as const)("the generated shape and bounded codec return the same %s review", example => {
  const expected = boundaryFixture(example);
  expect(validate(expected)).toBe(true);
  expect(baselineSchema.parse(expected)).toEqual(expected);
  expect(baselineCodec.decode(boundaryBytes(example))).toMatchObject({ status: "success", baseline: expected });
});

test.each([1, 2, 3, 4, 5])("format %i still rejects a boundary review", formatVersion => {
  const legacy = { formatVersion, id: "legacy", parentId: null, components: [], interfaces: [], rules: [], resources: [],
    boundaryReview: boundaryFixture().boundaryReview };
  expect(validate(legacy)).toBe(false);
  expect(baselineSchema.safeParse(legacy).success).toBe(false);
});
