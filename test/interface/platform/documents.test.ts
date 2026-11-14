import { expect, expectTypeOf, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import type { z } from "zod";
import nativeCases from "../../fixtures/document-native.json";
import byteIdentityCases from "../../fixtures/baseline-viewer/document-byte-identity.json";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import { readBrowserBaseline } from "../../../src/platform/browser-documents.ts";
import { DesktopDocumentAccess, type DocumentAccess } from "../../../src/platform/documents.ts";
import { documentContracts } from "../../../src/platform/documents-contract.ts";
import type { DocumentFileOperations } from "../../../src/platform/generated/contracts.ts";

const schemas = new Ajv2020({ schemas: [contracts] });

type RuntimeContracts = {
  [Name in keyof typeof documentContracts]: (
    request: z.output<(typeof documentContracts)[Name]["request"]>
  ) => z.output<(typeof documentContracts)[Name]["outcome"]>;
};
type LogicalAccess = {
  [Name in keyof DocumentAccess]: (
    ...args: Parameters<DocumentAccess[Name]>
  ) => Awaited<ReturnType<DocumentAccess[Name]>>;
};

test("selected-file validation and asynchronous access follow the native read contract", () => {
  expectTypeOf<RuntimeContracts>().toEqualTypeOf<DocumentFileOperations>();
  expectTypeOf<LogicalAccess>().toEqualTypeOf<DocumentFileOperations>();
});

test("browser unavailability and closed read requests conform to the generated schema", async () => {
  const outcome = await new DesktopDocumentAccess().readDocumentFile({ path: "/baseline.yaml" });
  expect(schemas.compile({ $ref: "ReadDocumentTextOutcome.json" })(outcome)).toBe(true);
  expect(documentContracts.readDocumentFile.outcome.safeParse(outcome).success).toBe(true);
  expect(outcome).toMatchObject({ status: "failure", code: "unavailable" });
  const validate = schemas.compile({ $ref: "ReadDocumentFileRequest.json" });
  expect(validate({ path: "/baseline.yaml" })).toBe(true);
  for (const request of [null, {}, { path: "/baseline.yaml", extra: true }]) {
    expect(validate(request)).toBe(false);
    expect(documentContracts.readDocumentFile.request.safeParse(request).success).toBe(false);
  }
});

test.each([
  ["export", "io-error"], ["cleanup", "io-error"],
  ["storage", "invalid-snapshot"], ["storage", "snapshot-limit"],
  ["storage", "destination-exists"], ["storage", "cleanup-failed"],
])("the read contract rejects a retired failure: %s/%s", (stage, code) => {
  const outcome = { status: "failure", stage, code, message: "Old operation failure", durationMs: 0 };
  expect(documentContracts.readDocumentFile.outcome.safeParse(outcome).success).toBe(false);
  expect(schemas.compile({ $ref: "ReadDocumentTextOutcome.json" })(outcome)).toBe(false);
});

test("the native and frontend read boundary share their wire fixtures", () => {
  for (const sample of nativeCases) {
    expect(sample.operation).toBe("readDocumentFile");
    const validRequest = !(sample.outcome.status === "failure" && sample.outcome.code === "invalid-request");
    expect(schemas.compile({ $ref: "ReadDocumentFileRequest.json" })(sample.request)).toBe(validRequest);
    expect(schemas.compile({ $ref: "ReadDocumentTextOutcome.json" })(sample.outcome)).toBe(true);
    expect(documentContracts.readDocumentFile.request.safeParse(sample.request).success).toBe(validRequest);
    expect(documentContracts.readDocumentFile.outcome.safeParse(sample.outcome).success).toBe(true);
  }
});

test.each(byteIdentityCases)("browser reading identifies the original bytes as $sha256", async ({ text, sha256 }) => {
  const file = new File([text], "baseline.yaml");
  const outcome = await readBrowserBaseline(file, new AbortController().signal);
  expect(outcome).toMatchObject({ status: "success", text: text.replace(/^\uFEFF/, ""), sha256 });
});

test("a UTF-8 BOM counts against the original byte limit", async () => {
  const signal = new AbortController().signal;
  const text = "\uFEFF" + "a".repeat(16 * 1024 * 1024 - 3);
  const outcome = await readBrowserBaseline(new File([text], "maximum.yaml"), signal);
  expect(outcome).toMatchObject({
    status: "success", sha256: "437d127cb8797f8b7132e79138729a1f1d10b1b95dbd86fb29395d4c92229f3e",
  });
  if (outcome.status === "success") expect(outcome.text).toHaveLength(text.length - 1);
  const overLimit = await readBrowserBaseline(new File([text, "a"], "over-maximum.yaml"), signal);
  expect(overLimit).toMatchObject({ status: "failure", code: "limit-exceeded" });
});

test("native success envelopes require a lowercase SHA-256, which the adapter returns unchanged", async () => {
  const [original] = byteIdentityCases;
  if (!original) throw new Error("The baseline byte identity fixture is empty.");
  const response = { status: "success", text: original.text, durationMs: 0 } as const;
  const digest = original.sha256;
  const schema = schemas.compile({ $ref: "ReadDocumentTextOutcome.json" });
  for (const sha256 of [undefined, "", digest.slice(1), digest.toUpperCase(), `${digest}\n`, 123]) {
    const malformed = sha256 === undefined ? response : { ...response, sha256 };
    expect(schema(malformed)).toBe(false);
    const desktop = new DesktopDocumentAccess(async () => malformed, () => true);
    expect(await desktop.readDocumentFile({ path: "/baseline.yaml" })).toMatchObject({ code: "invalid-response" });
  }
  const valid = { ...response, sha256: digest };
  expect(schema(valid)).toBe(true);
  const desktop = new DesktopDocumentAccess(async () => valid, () => true);
  expect(await desktop.readDocumentFile({ path: "/baseline.yaml" })).toEqual(valid);
});
