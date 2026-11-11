import { expect, expectTypeOf, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import type { z } from "zod";
import nativeCases from "../../fixtures/document-native.json";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import { DesktopDocumentAccess, type DocumentAccess } from "../../../src/platform/documents.ts";
import { documentContracts } from "../../../src/platform/documents-contract.ts";
import type { DocumentFileOperations } from "../../../src/platform/generated/contracts.ts";

const schemas = new Ajv2020({ schemas: [contracts] });
const definitions = {
  createDocumentSnapshot: { request: "CreateDocumentSnapshotRequest", outcome: "CreateDocumentSnapshotOutcome" },
  readDocumentSnapshot: { request: "DocumentSnapshotRequest", outcome: "ReadDocumentTextOutcome" },
  releaseDocumentSnapshot: { request: "DocumentSnapshotRequest", outcome: "ReleaseDocumentSnapshotOutcome" },
  readDocumentFile: { request: "ReadDocumentFileRequest", outcome: "ReadDocumentTextOutcome" },
  exportDocument: { request: "ExportDocumentRequest", outcome: "ExportDocumentOutcome" },
  retryDocumentCleanup: { request: "RetryDocumentCleanupRequest", outcome: "RetryDocumentCleanupOutcome" },
} as const;

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
  expectTypeOf<RuntimeContracts>().toEqualTypeOf<Pick<DocumentFileOperations, "readDocumentFile">>();
  expectTypeOf<LogicalAccess>().toEqualTypeOf<Pick<DocumentFileOperations, "readDocumentFile">>();
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

test("shared native wire cases retain all native contracts until native retirement", () => {
  for (const sample of nativeCases) {
    expect(Object.hasOwn(definitions, sample.operation)).toBe(true);
    const operation = sample.operation as keyof DocumentFileOperations;
    const definition = definitions[operation];
    const validRequest = !(sample.outcome.status === "failure" && sample.outcome.code === "invalid-request");
    expect(schemas.compile({ $ref: `${definition.request}.json` })(sample.request)).toBe(validRequest);
    expect(schemas.compile({ $ref: `${definition.outcome}.json` })(sample.outcome)).toBe(true);
    if (operation === "readDocumentFile") {
      expect(documentContracts.readDocumentFile.request.safeParse(sample.request).success).toBe(validRequest);
      expect(documentContracts.readDocumentFile.outcome.safeParse(sample.outcome).success).toBe(true);
    }
  }
});
