import { expect, expectTypeOf, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import type { z } from "zod";
import nativeCases from "../../fixtures/document-native.json";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
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
