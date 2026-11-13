import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { stringify } from "yaml";
import { decodeBaselineYaml } from "../../../src/lib/baseline-yaml.ts";
import { baselineExample, invalidBaseline, reviewedBaseline } from "../../support/baseline-fixtures.ts";
import { excessiveDocumentation } from "../../support/interface-documentation-fixtures.ts";

test.each(["empty", "full"] as const)("decodes the reviewed %s baseline without changing its records", (example) => {
  const text = readFileSync(`test/fixtures/baseline-viewer/${example}.yaml`, "utf8");
  const outcome = decodeBaselineYaml(text);
  expect(outcome.status).toBe("success");
  expect(outcome).toMatchObject({ status: "success", baseline: reviewedBaseline(example) });
  expect(Number.isFinite(outcome.durationMs)).toBe(true);
  expect(outcome.durationMs).toBeGreaterThanOrEqual(0);
});

test("accepts a byte order mark, CRLF, and non-ASCII statement text", () => {
  const baseline = baselineExample();
  const component = baseline.components[0];
  if (!component) throw new Error("The fixture needs a component.");
  component.name = "Facturación 東京";
  component.purpose.value = "Créer des factures";
  const text = `\uFEFF${stringify(baseline).replaceAll("\n", "\r\n")}`;
  const outcome = decodeBaselineYaml(text);
  expect(outcome.status).toBe("success");
  expect(outcome).toMatchObject({ status: "success", baseline });
});

test("identifies an unsupported baseline format version", () => {
  const text = stringify({ ...baselineExample(), formatVersion: 3 });
  expect(decodeBaselineYaml(text)).toMatchObject({
    status: "failure", stage: "decoding", code: "unsupported-version",
  });
});

test("identifies the field when baseline references are invalid", () => {
  const invalid = invalidBaseline("an owner ID that does not exist");
  expect(decodeBaselineYaml(stringify(invalid.input))).toMatchObject({
    status: "failure", stage: "decoding", code: "invalid-document",
    message: expect.stringContaining(invalid.path),
  });
});

test("rejects legacy diagram content", () => {
  const outcome = decodeBaselineYaml(readFileSync(new URL("../../fixtures/baseline-viewer/legacy.choom.yaml", import.meta.url), "utf8"));
  expect(outcome.status).toBe("failure");
  expect(outcome).toMatchObject({
    status: "failure", stage: "decoding", code: "invalid-document",
    message: "Legacy diagrams are unsupported. Open a baseline with formatVersion: 1 or 2.",
  });
});

test("documentation limits identify the field and limit without changing the failure code", () => {
  const outcome = decodeBaselineYaml(stringify(excessiveDocumentation("entries per interface")));
  expect(outcome).toMatchObject({
    status: "failure", stage: "decoding", code: "invalid-document",
    message: expect.stringMatching(/interfaces\.0\.documentation\.entries.*limit is 32 entries per interface/),
  });
});

test("does not classify a declared baseline as a legacy diagram", () => {
  const outcome = decodeBaselineYaml(`formatVersion: 1\n${readFileSync(new URL("../../fixtures/baseline-viewer/legacy.choom.yaml", import.meta.url), "utf8")}`);
  expect(outcome).toMatchObject({ status: "failure", code: "invalid-document" });
  expect(JSON.stringify(outcome)).not.toContain("Legacy diagrams");
});

test.each([
  ["malformed YAML", "components: [\n"],
  ["duplicate mapping keys", "formatVersion: 1\nformatVersion: 1\n"],
  ["custom tags", "id: !baseline example\n"],
  ["explicit standard tags", "id: !!str example\n"],
  ["anchors", "id: &baseline example\n"],
  ["aliases", "id: *baseline\n"],
  ["directives", "%YAML 1.2\n---\nid: example\n"],
  ["two documents", "id: first\n---\nid: second\n"],
  ["non-string mapping keys", "true: example\n"],
  ["nonfinite values", "metric: .inf\n"],
  ["empty input", "# no baseline\n"],
])("keeps the YAML rejection for %s", (_problem, text) => {
  expect(decodeBaselineYaml(text)).toMatchObject({
    status: "failure", stage: "decoding", code: "invalid-encoding",
  });
});

test("bounds UTF-8 bytes, structure nodes, and nesting before model validation", () => {
  const inputs = [
    "é".repeat(8_388_609),
    `[${"0,".repeat(250_000)}0]`,
    `${"[".repeat(33)}0${"]".repeat(33)}`,
  ];
  for (const text of inputs) {
    expect(decodeBaselineYaml(text)).toMatchObject({
      status: "failure", stage: "decoding", code: "limit-exceeded",
    });
  }
});

test("does not expose file contents in syntax or unknown-field errors", () => {
  const privateText = "/private/<script>/raw-data";
  const inputs = [
    `id: ["${privateText}"\n`,
    stringify({ ...baselineExample(), [privateText]: true }),
  ];
  for (const text of inputs) {
    const outcome = decodeBaselineYaml(text);
    expect(outcome.status).toBe("failure");
    expect(JSON.stringify(outcome)).not.toContain(privateText);
  }
});
