import { expect, expectTypeOf, test } from "bun:test";
import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { stringify } from "yaml";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import { decodeBaselineYaml } from "../../../src/lib/baseline-yaml.ts";
import type { DiscoveryResultCodec } from "../../../src/lib/generated/contracts.ts";
import { decodeDiscoveryResultYaml, discoveryResultCodec } from "../../../src/lib/discovery-result-yaml.ts";
import { discoveryFixture } from "../../support/discovery-fixtures.ts";

// The discovery result codec: the bounded YAML reader of a baseline, the checks
// of @choom/baseline-model, and the binding to the open baseline file, with the
// outcomes of the generated TypeSpec contract.
const outcomes = addFormats(new Ajv2020({ schemas: [contracts], ownProperties: true }))
  .compile({ $ref: "DecodeDiscoveryResultOutcome.json" });

function decode(text: string, change?: (fixture: ReturnType<typeof discoveryFixture>) => void) {
  const fixture = discoveryFixture();
  change?.(fixture);
  return discoveryResultCodec.decode(text, fixture.baseline, fixture.sha256);
}

test("the codec conforms to the generated TypeSpec interface", () => {
  expectTypeOf(discoveryResultCodec).toExtend<DiscoveryResultCodec>();
});

test("a discovery result for the open baseline file decodes with all its records", () => {
  const { baselineText, sha256, result } = discoveryFixture();
  const opened = decodeBaselineYaml(baselineText);
  if (opened.status !== "success") throw new Error("Invalid baseline fixture.");
  expect(createHash("sha256").update(baselineText).digest("hex")).toBe(sha256);
  const outcome = decodeDiscoveryResultYaml(stringify(result), opened.baseline, sha256);
  expect(outcome).toMatchObject({ status: "success", result });
  expect(outcomes(outcome)).toBe(true);
});

test.each<[string, string, string]>([
  ["version 1", stringify({ ...discoveryFixture().result, formatVersion: 1 }), "unsupported-version"],
  ["another kind", stringify({ ...discoveryFixture().result, kind: "interface-duplication-review" }), "invalid-document"],
  ["an unknown field", stringify({ ...discoveryFixture().result, notes: [] }), "invalid-document"],
  ["101 subjects", stringify({ ...discoveryFixture().result, gaps: discoveryFixture().result.gaps.map((gap) => ({
    ...gap, subjectRefs: Array.from({ length: 101 }, (_, index) => `src/file-${index}.ts`) })) }), "limit-exceeded"],
  ["another baseline file", stringify({ ...discoveryFixture().result, baselineDigest: "0".repeat(64) }), "baseline-mismatch"],
  ["an explicit tag", "kind: !tag architecture-discovery", "invalid-encoding"],
  ["an alias", "kind: &kind architecture-discovery\nrunRef: *kind", "invalid-encoding"],
  ["two documents", `${stringify(discoveryFixture().result)}---\n{}\n`, "invalid-encoding"],
])("%s fails with its code and a contract outcome", (_name, text, code) => {
  const outcome = decode(text);
  expect(outcome).toMatchObject({ status: "failure", stage: "decoding", code });
  expect(outcomes(outcome)).toBe(true);
});

test("a reformatted baseline file has another digest, so its earlier result does not bind", () => {
  const { baseline, result } = discoveryFixture();
  const reformatted = JSON.stringify(baseline);
  const sha256 = createHash("sha256").update(reformatted).digest("hex");
  expect(decodeDiscoveryResultYaml(stringify(result), baseline, sha256)).toMatchObject({ status: "failure", code: "baseline-mismatch" });
});

test("a message stays within the contract limit for a very long field name", () => {
  const outcome = decode(JSON.stringify({ ...discoveryFixture().result, ["x".repeat(5_000)]: true }));
  expect(outcome).toMatchObject({ status: "failure", code: "invalid-document" });
  expect(outcome.status === "failure" && outcome.message.length).toBeLessThanOrEqual(2048);
  expect(outcomes(outcome)).toBe(true);
});
