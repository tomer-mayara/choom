import { expect, expectTypeOf, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import type { z } from "zod";
import nativeCases from "../../fixtures/document-native.json";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import { desktopDocumentAccess, type DocumentAccess } from "../../../src/platform/documents.ts";
import { documentContracts } from "../../../src/platform/documents-contract.ts";
import type { DocumentFileOperations } from "../../../src/platform/generated/contracts.ts";

const schemas = new Ajv2020({ schemas: [contracts] });
const snapshotId = "document-00000000-0000-4000-8000-000000000000-1";
const definitions = {
  createDocumentSnapshot: { request: "CreateDocumentSnapshotRequest", outcome: "CreateDocumentSnapshotOutcome" },
  readDocumentSnapshot: { request: "DocumentSnapshotRequest", outcome: "ReadDocumentTextOutcome" },
  releaseDocumentSnapshot: { request: "DocumentSnapshotRequest", outcome: "ReleaseDocumentSnapshotOutcome" },
  readDocumentFile: { request: "ReadDocumentFileRequest", outcome: "ReadDocumentTextOutcome" },
  exportDocument: { request: "ExportDocumentRequest", outcome: "ExportDocumentOutcome" },
  retryDocumentCleanup: { request: "RetryDocumentCleanupRequest", outcome: "RetryDocumentCleanupOutcome" },
} as const;
const requests = {
  createDocumentSnapshot: { text: "schemaVersion: 1\n" },
  readDocumentSnapshot: { snapshotId },
  releaseDocumentSnapshot: { snapshotId },
  readDocumentFile: { path: "/saved architecture.choom.yaml" },
  exportDocument: { path: "/saved architecture.choom.yaml", text: "schemaVersion: 1\n", overwrite: false },
  retryDocumentCleanup: {},
};

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

test("document validators and asynchronous access follow the TypeSpec operations", () => {
  expectTypeOf<RuntimeContracts>().toEqualTypeOf<DocumentFileOperations>();
  expectTypeOf<LogicalAccess>().toEqualTypeOf<DocumentFileOperations>();
});

test("browser document failures satisfy each native outcome contract", async () => {
  const outcomes = {
    createDocumentSnapshot: await desktopDocumentAccess.createDocumentSnapshot(requests.createDocumentSnapshot),
    readDocumentSnapshot: await desktopDocumentAccess.readDocumentSnapshot(requests.readDocumentSnapshot),
    releaseDocumentSnapshot: await desktopDocumentAccess.releaseDocumentSnapshot(requests.releaseDocumentSnapshot),
    readDocumentFile: await desktopDocumentAccess.readDocumentFile(requests.readDocumentFile),
    exportDocument: await desktopDocumentAccess.exportDocument(requests.exportDocument),
    retryDocumentCleanup: await desktopDocumentAccess.retryDocumentCleanup(requests.retryDocumentCleanup),
  };
  for (const [name, definition] of Object.entries(definitions)) {
    const operation = name as keyof DocumentFileOperations;
    expect(schemas.compile({ $ref: `${definition.outcome}.json` })(outcomes[operation])).toBe(true);
    expect(documentContracts[operation].outcome.safeParse(outcomes[operation]).success).toBe(true);
    expect(outcomes[operation]).toMatchObject({ status: "failure", code: "unavailable" });
  }
});

test("document requests are closed at structural and runtime boundaries", () => {
  for (const [name, definition] of Object.entries(definitions)) {
    const operation = name as keyof DocumentFileOperations;
    const validate = schemas.compile({ $ref: `${definition.request}.json` });
    expect(validate(requests[operation])).toBe(true);
    expect(documentContracts[operation].request.safeParse(requests[operation]).success).toBe(true);
    for (const invalid of [null, { ...requests[operation], unexpected: true }]) {
      expect(validate(invalid)).toBe(false);
      expect(documentContracts[operation].request.safeParse(invalid).success).toBe(false);
    }
    if (operation !== "retryDocumentCleanup") {
      expect(validate({})).toBe(false);
      expect(documentContracts[operation].request.safeParse({}).success).toBe(false);
    }
  }
});

test("native byte, absolute-path, and counter rules strengthen structural validation", () => {
  const relative = { path: "saved.choom.yaml" };
  const oversized = { path: `/${"中".repeat(1366)}` };
  for (const request of [relative, oversized]) {
    expect(schemas.compile({ $ref: "ReadDocumentFileRequest.json" })(request)).toBe(true);
    expect(documentContracts.readDocumentFile.request.safeParse(request).success).toBe(false);
  }
  const overflowing = { snapshotId: snapshotId.replace(/-1$/, "-18446744073709551616") };
  expect(schemas.compile({ $ref: "DocumentSnapshotRequest.json" })(overflowing)).toBe(true);
  expect(documentContracts.readDocumentSnapshot.request.safeParse(overflowing).success).toBe(false);
});

test("shared native wire cases satisfy the same request and outcome boundaries", () => {
  // Rust exercises these cases through the production commands and capability
  // context. It substitutes issued snapshot IDs and the selected fixture path.
  for (const sample of nativeCases) {
    expect(Object.hasOwn(definitions, sample.operation)).toBe(true);
    const operation = sample.operation as keyof DocumentFileOperations;
    const definition = definitions[operation];
    const validRequest = !(sample.outcome.status === "failure" && sample.outcome.code === "invalid-request");
    expect(schemas.compile({ $ref: `${definition.request}.json` })(sample.request)).toBe(validRequest);
    expect(documentContracts[operation].request.safeParse(sample.request).success).toBe(validRequest);
    expect(schemas.compile({ $ref: `${definition.outcome}.json` })(sample.outcome)).toBe(true);
    expect(documentContracts[operation].outcome.safeParse(sample.outcome).success).toBe(true);
  }
});
