import { expect, expectTypeOf, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { stringify } from "yaml";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import { baselineCodec } from "../../../src/lib/baseline-yaml.ts";
import type { BaselineCodec } from "../../../src/lib/generated/contracts.ts";
import { baselineExample } from "../../support/baseline-fixtures.ts";

const schemas = addFormats(new Ajv2020({ schemas: [contracts], ownProperties: true }));

test("the public decoder returns the generated baseline outcome", () => {
  expectTypeOf(baselineCodec).toExtend<BaselineCodec>();
  const baseline = baselineExample();
  const outcome = baselineCodec.decode(stringify(baseline));
  expect(outcome.status).toBe("success");
  expect(schemas.compile({ $ref: "DecodeBaselineOutcome.json" })(outcome)).toBe(true);
  expect(outcome).toMatchObject({ baseline });
});

test("the public decoder uses the declared failure codes and decoding stage", () => {
  const validate = schemas.compile({ $ref: "BaselineDecodeFailure.json" });
  const cases = [
    [stringify({ ...baselineExample(), formatVersion: 3 }), "unsupported-version"],
    ["id: !tag baseline\n", "invalid-encoding"],
    ["formatVersion: 1\n", "invalid-document"],
    ["é".repeat(8_388_609), "limit-exceeded"],
  ] as const;
  for (const [text, code] of cases) {
    const outcome = baselineCodec.decode(text);
    expect(outcome).toMatchObject({ status: "failure", stage: "decoding", code });
    expect(validate(outcome)).toBe(true);
  }
});
