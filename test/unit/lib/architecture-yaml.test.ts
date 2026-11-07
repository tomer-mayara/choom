import { expect, test } from "bun:test";
import { stringify } from "yaml";
import { decodeArchitectureYaml, encodeArchitectureYaml } from "../../../src/lib/architecture-yaml.ts";
import { architectureDocumentFixture } from "../../support/document-fixtures.ts";

test("keeps the declared component set, deep evidence, counts, and ordered findings", () => {
  const document = architectureDocumentFixture();
  const encoded = encodeArchitectureYaml(document);
  expect(encoded.status).toBe("success");
  if (encoded.status !== "success") throw new Error(encoded.message);

  const decoded = decodeArchitectureYaml(encoded.text);
  expect(decoded.status).toBe("success");
  if (decoded.status !== "success") throw new Error(decoded.message);
  expect(decoded.document).toEqual(document);
  expect(Object.hasOwn(decoded.document.diagnostics[0]?.metrics ?? {}, "__proto__")).toBe(true);
});

test("reordered saved collections produce the same canonical YAML", () => {
  const document = architectureDocumentFixture();
  const shuffled = architectureDocumentFixture();
  shuffled.components.reverse();
  shuffled.relationships[0]?.evidence.reverse();
  shuffled.diagnostics[0]?.subjects.reverse();

  const decoded = decodeArchitectureYaml(stringify(shuffled));
  if (decoded.status !== "success") throw new Error(decoded.message);
  const original = encodeArchitectureYaml(document);
  const canonical = encodeArchitectureYaml(decoded.document);
  if (original.status !== "success") throw new Error(original.message);
  if (canonical.status !== "success") throw new Error(canonical.message);
  expect(canonical.text).toBe(original.text);
});

test("accepts valid flow collections with a trailing comma and comments", () => {
  const document = architectureDocumentFixture();
  const text = `${stringify(document, { flow: true }).trimEnd().slice(0, -1)},\n# end\n}`;
  expect(decodeArchitectureYaml(text)).toMatchObject({ status: "success", document });
});

test.each([
  ["duplicate mapping keys", "name: Atlas\nname: Beacon\n"],
  ["custom tags", "name: !example Atlas\n"],
  ["explicit standard tags", "name: !!str Atlas\n"],
  ["anchors", "name: &atlas Atlas\n"],
  ["aliases", "name: *atlas\n"],
  ["directives", "%YAML 1.2\n---\nname: Atlas\n"],
  ["two documents", "name: Atlas\n---\nname: Beacon\n"],
  ["non-string keys", "true: Atlas\n"],
  ["collection keys", "? [name]\n: Atlas\n"],
  ["nonfinite values", "metric: .inf\n"],
  ["empty input", "# no document\n"],
])("decoding refuses %s", (_label, text) => {
  expect(decodeArchitectureYaml(text)).toMatchObject({
    status: "failure", stage: "decoding", code: "invalid-encoding",
  });
});

test("classifies versions and strict semantic errors without returning the input", () => {
  const invalid = { ...architectureDocumentFixture(), privatePath: "/home/alex/Atlas" };
  expect(encodeArchitectureYaml({ ...invalid, schemaVersion: 2 })).toMatchObject({
    status: "failure", stage: "encoding", code: "unsupported-version",
  });
  expect(decodeArchitectureYaml(stringify({ ...invalid, schemaVersion: 2 }))).toMatchObject({
    status: "failure", stage: "decoding", code: "unsupported-version",
  });
  for (const outcome of [encodeArchitectureYaml(invalid), decodeArchitectureYaml(stringify(invalid))]) {
    expect(outcome).toMatchObject({ status: "failure", code: "invalid-document" });
    expect(JSON.stringify(outcome)).not.toContain("/home/alex");
  }
});

test("checks text bytes, structure nodes, and depth before decoding", () => {
  const text = "é".repeat(8_388_609);
  const manyNodes = `[${"0,".repeat(250_000)}0]`;
  const deep = `${"[".repeat(10_000)}0${"]".repeat(10_000)}`;
  for (const input of [text, manyNodes, deep]) {
    expect(decodeArchitectureYaml(input)).toMatchObject({
      status: "failure", stage: "decoding", code: "limit-exceeded",
    });
  }
});

test("applies the depth boundary to empty collections and implicit flow mappings", () => {
  const sequence = (depth: number, value: string) => `${"[".repeat(depth)}${value}${"]".repeat(depth)}`;
  expect(decodeArchitectureYaml(sequence(32, ""))).toMatchObject({ status: "failure", code: "invalid-document" });
  for (const text of [sequence(33, ""), sequence(32, "key: null")]) {
    expect(decodeArchitectureYaml(text)).toMatchObject({ status: "failure", code: "limit-exceeded" });
  }
});

test("rejects a flow separator flood before constructing composition diagnostics", () => {
  const text = `[${",".repeat(300_000)}]`;
  expect(decodeArchitectureYaml(text)).toMatchObject({
    status: "failure", stage: "decoding", code: "limit-exceeded",
  });
});

test("applies the lexical token limit before composing a wide mapping", () => {
  const text = "key: [value, value] # note\n".repeat(180_000);
  expect(decodeArchitectureYaml(text)).toMatchObject({
    status: "failure", stage: "decoding", code: "limit-exceeded",
    message: "The architecture document exceeds the YAML token limit.",
  });
});

test("stops at the first invalid escape in a quoted scalar", () => {
  const text = `name: "${"\\q".repeat(300_000)}"\n`;
  expect(decodeArchitectureYaml(text)).toMatchObject({
    status: "failure", stage: "decoding", code: "invalid-encoding", message: "YAML scalar syntax is invalid.",
  });
});

test("bounds line breaks inside scalar content on both format boundaries", () => {
  const message = "detail\n".repeat(250_001);
  expect(decodeArchitectureYaml(`name: |+\n${"  detail\n".repeat(250_001)}`)).toMatchObject({
    status: "failure", stage: "decoding", code: "limit-exceeded",
  });
  expect(encodeArchitectureYaml(architectureDocumentFixture(message))).toMatchObject({
    status: "failure", stage: "encoding", code: "limit-exceeded",
  });
});

test("counts bare carriage returns and treats a CRLF pair as one line break", () => {
  expect(decodeArchitectureYaml(`name: "${"\r".repeat(250_001)}"`)).toMatchObject({
    status: "failure", stage: "decoding", code: "limit-exceeded",
  });
  expect(decodeArchitectureYaml(`name: Atlas\r\n${"\r\n".repeat(125_000)}`)).toMatchObject({
    status: "failure", stage: "decoding", code: "invalid-document",
  });
});

test("checks bytes, structure nodes, and depth before validating an encoding input", () => {
  let deep: unknown = 0;
  for (let index = 0; index < 33; index++) deep = [deep];
  for (const input of ["é".repeat(8_388_609), Array.from({ length: 250_001 }, () => 0), deep]) {
    expect(encodeArchitectureYaml(input)).toMatchObject({
      status: "failure", stage: "encoding", code: "limit-exceeded",
    });
  }
});

test("rejects cycles and accessors without traversing them", () => {
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  let getterRan = false;
  const accessor = { get name() { getterRan = true; return "Atlas"; } };
  for (const input of [cyclic, accessor, new Date(), [undefined], [Number.NaN], [1n]]) {
    expect(encodeArchitectureYaml(input)).toMatchObject({
      status: "failure", stage: "encoding", code: "invalid-encoding",
    });
  }
  expect(getterRan).toBe(false);
});

test("encodes shared acyclic data without anchors or aliases", () => {
  const document = architectureDocumentFixture();
  const finding = document.diagnostics[0];
  if (!finding) throw new Error("The document needs a finding.");
  document.diagnostics.push(finding);
  const encoded = encodeArchitectureYaml(document);
  if (encoded.status !== "success") throw new Error(encoded.message);
  expect(encoded.text).not.toMatch(/[&*]a\d+/u);
  const decoded = decodeArchitectureYaml(encoded.text);
  if (decoded.status !== "success") throw new Error(decoded.message);
  expect(decoded.document.diagnostics).toEqual([finding, finding]);
});
