import { expect, test } from "bun:test";
import { stringify } from "yaml";
import { decodeBaselineYaml } from "../../../src/lib/baseline-yaml.ts";
import { baselineExample } from "../../support/baseline-fixtures.ts";

test("accepts flow collections with a trailing comma and comments", () => {
  const baseline = baselineExample();
  const text = `${stringify(baseline, { flow: true }).trimEnd().slice(0, -1)},\n# end\n}`;
  expect(decodeBaselineYaml(text)).toMatchObject({ status: "success", baseline });
});

test("rejects collection mapping keys", () => {
  expect(decodeBaselineYaml("? [id]\n: example\n")).toMatchObject({
    status: "failure", stage: "decoding", code: "invalid-encoding",
  });
});

test("identifies unsupported tags and anchors without exposing their names", () => {
  expect(decodeBaselineYaml("id: !private-tag example\n")).toMatchObject({
    status: "failure", code: "invalid-encoding", message: "Explicit YAML tags are unsupported.",
  });
  expect(decodeBaselineYaml("id: &private-anchor example\n")).toMatchObject({
    status: "failure", code: "invalid-encoding", message: "YAML anchors are unsupported.",
  });
});

test("rejects extreme nesting before composing YAML", () => {
  const text = `${"[".repeat(10_000)}0${"]".repeat(10_000)}`;
  expect(decodeBaselineYaml(text)).toMatchObject({
    status: "failure", stage: "decoding", code: "limit-exceeded",
  });
});

test("counts empty collections and implicit flow mappings in the depth limit", () => {
  const sequence = (depth: number, value: string) => `${"[".repeat(depth)}${value}${"]".repeat(depth)}`;
  expect(decodeBaselineYaml(sequence(32, ""))).toMatchObject({ status: "failure", code: "invalid-document" });
  for (const text of [sequence(33, ""), sequence(32, "key: null")]) {
    expect(decodeBaselineYaml(text)).toMatchObject({ status: "failure", code: "limit-exceeded" });
  }
});

test("rejects a separator flood before constructing composition diagnostics", () => {
  expect(decodeBaselineYaml(`[${",".repeat(300_000)}]`)).toMatchObject({
    status: "failure", stage: "decoding", code: "limit-exceeded",
  });
});

test("applies the lexical token limit before composing a wide mapping", () => {
  const text = "key: [value, value] # note\n".repeat(180_000);
  expect(decodeBaselineYaml(text)).toMatchObject({
    status: "failure", stage: "decoding", code: "limit-exceeded",
    message: "The architecture document exceeds the YAML token limit.",
  });
});

test("stops at the first invalid escape in a quoted scalar", () => {
  const text = `id: "${"\\q".repeat(300_000)}"\n`;
  expect(decodeBaselineYaml(text)).toMatchObject({
    status: "failure", stage: "decoding", code: "invalid-encoding", message: "YAML scalar syntax is invalid.",
  });
});

test("bounds line breaks inside scalar content", () => {
  expect(decodeBaselineYaml(`id: |+\n${"  detail\n".repeat(250_001)}`)).toMatchObject({
    status: "failure", stage: "decoding", code: "limit-exceeded",
  });
});

test("counts bare carriage returns and treats a CRLF pair as one line break", () => {
  expect(decodeBaselineYaml(`id: "${"\r".repeat(250_001)}"`)).toMatchObject({
    status: "failure", stage: "decoding", code: "limit-exceeded",
  });
  expect(decodeBaselineYaml(`id: example\r\n${"\r\n".repeat(125_000)}`)).toMatchObject({
    status: "failure", stage: "decoding", code: "invalid-document",
  });
});
