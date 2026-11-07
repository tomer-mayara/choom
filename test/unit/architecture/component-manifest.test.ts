import { expect, test } from "bun:test";
import { stringify } from "yaml";
import {
  isManifestReference,
  readComponentManifest,
} from "../../../src/architecture/component-manifest";

test("a minimal declaration and ordinary YAML aliases are accepted", () => {
  expect(readComponentManifest("name: &label Atlas\ndescription: *label\n")).toEqual({ name: "Atlas", description: "Atlas" });
  expect(readComponentManifest("name: workspace\n")).toEqual({ name: "workspace" });
});

test.each([
  ["empty document", ""],
  ["blank name", "name: '  '\n"],
  ["unknown field", "name: Atlas\nlayout: left\n"],
  ["duplicate keys", "name: Atlas\nname: other\n"],
  ["two documents", "name: Atlas\n---\nname: other\n"],
  ["custom tag", "name: !component Atlas\n"],
  ["non-core tag", "name: !!timestamp 2026-11-06\n"],
  ["unresolved alias", "name: *absent\n"],
  ["merge key", "name: Atlas\n<<: { description: merged }\n"],
  ["nested unknown field", "name: Atlas\nchildren: [{name: child, path: src, extra: true}]\n"],
  ["metadata on another artifact kind", "name: Atlas\nartifacts: {behavior: [{path: f.feature, inputs: [src]}]}\n"],
])("the manifest reader rejects %s", (_label, text) => {
  expect(() => readComponentManifest(text)).toThrow(expect.objectContaining({ code: "invalid-manifest" }));
});

test("the text budget uses UTF-8 bytes and includes the boundary value", () => {
  const prefix = "name: Atlas\n#";
  const atLimit = prefix + "a".repeat(262_144 - prefix.length);
  expect(readComponentManifest(atLimit)).toEqual({ name: "Atlas" });
  expect(() => readComponentManifest(`${atLimit}a`)).toThrow(expect.objectContaining({ code: "limit-exceeded" }));
  expect(() => readComponentManifest(prefix + "é".repeat(131_072))).toThrow(expect.objectContaining({ code: "limit-exceeded" }));
});

test("manifest lists allow 128 entries and reject the next", () => {
  const children = Array.from({ length: 128 }, (_, index) => ({ name: `component-${index}`, path: `folder-${index}` }));
  expect(readComponentManifest(stringify({ name: "Atlas", children })).children).toHaveLength(128);
  children.push({ name: "extra", path: "extra" });
  expect(() => readComponentManifest(stringify({ name: "Atlas", children }))).toThrow(expect.objectContaining({ code: "limit-exceeded" }));
});

test("deep and oversized YAML structures fail before manifest interpretation", () => {
  const deep = `name: Atlas\nunknown: ${"[".repeat(33)}0${"]".repeat(33)}\n`;
  const wide = `name: Atlas\nunknown: [${Array.from({ length: 10_000 }, () => "0").join(",")}]\n`;
  expect(() => readComponentManifest(deep)).toThrow(expect.objectContaining({ code: "limit-exceeded" }));
  expect(() => readComponentManifest(wide)).toThrow(expect.objectContaining({ code: "limit-exceeded" }));
});

test("the depth budget permits 32 collections and rejects the next", () => {
  const nested = (arrays: number) => `name: Atlas\nunknown: ${"[".repeat(arrays)}0${"]".repeat(arrays)}\n`;
  // At the structure limit, only the unknown manifest field prevents acceptance.
  expect(() => readComponentManifest(nested(31))).toThrow(expect.objectContaining({ code: "invalid-manifest" }));
  expect(() => readComponentManifest(nested(32))).toThrow(expect.objectContaining({ code: "limit-exceeded" }));
});

test("alias expansion has a bounded resource budget", () => {
  const children = Array.from({ length: 49 }, (_, index) => `  - {name: *label, path: folder-${index}}`).join("\n");
  const text = `name: &label Atlas\nchildren:\n${children}\n`;
  expect(readComponentManifest(text).children).toHaveLength(49);
  expect(() => readComponentManifest(`${text}  - {name: *label, path: extra}\n`)).toThrow(expect.objectContaining({ code: "limit-exceeded" }));
});

test.each([".", "./src", "../core", "source files/café.ts", "a-b/name", " file "])("literal relative reference %s is allowed", (reference) => {
  expect(isManifestReference(reference)).toBe(true);
});

test.each(["", "/tmp/repo", "C:/source", "src\\file", "src/*.ts", "src/{a,b}", "$(pwd)", "src;echo", "--config", "src\u0000file", "\ud800"])("nonliteral reference %j is rejected", (reference) => {
  expect(isManifestReference(reference)).toBe(false);
});

test("overlong manifest references are refused before native resolution", () => {
  expect(isManifestReference("a".repeat(4096))).toBe(true);
  expect(isManifestReference("a".repeat(4097))).toBe(false);
  expect(isManifestReference("é".repeat(2049))).toBe(false);
});
