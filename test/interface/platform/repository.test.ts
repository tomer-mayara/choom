import { expect, expectTypeOf, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import type { z } from "zod";
import nativeCases from "../../fixtures/repository-native.json";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import type { RepositoryOperations } from "../../../src/platform/generated/contracts";
import { desktopRepositoryAccess, type RepositoryAccess } from "../../../src/platform/repository";
import { repositoryContracts } from "../../../src/platform/repository-contract";

const schemas = new Ajv2020({ schemas: [contracts] });
const definitions = {
  openRepository: "OpenRepository",
  readRepositoryText: "ReadRepositoryText",
  resolveRepositoryPaths: "ResolveRepositoryPaths",
  closeRepository: "CloseRepository",
} as const;

type RuntimeContracts = {
  [Name in keyof typeof repositoryContracts]: (
    request: z.output<(typeof repositoryContracts)[Name]["request"]>
  ) => z.output<(typeof repositoryContracts)[Name]["outcome"]>;
};
type LogicalAccess = {
  [Name in keyof RepositoryAccess]: (
    ...args: Parameters<RepositoryAccess[Name]>
  ) => Awaited<ReturnType<RepositoryAccess[Name]>>;
};

test("native request/result validators and asynchronous access match TypeSpec operations", () => {
  expectTypeOf<RuntimeContracts>().toEqualTypeOf<RepositoryOperations>();
  expectTypeOf<LogicalAccess>().toEqualTypeOf<RepositoryOperations>();
});

test("browser failures conform to every repository operation result", async () => {
  const repositorySession = "repository-1";
  const outcomes = {
    openRepository: await desktopRepositoryAccess.openRepository({ rootPath: "/repo" }),
    readRepositoryText: await desktopRepositoryAccess.readRepositoryText({ repositorySession, path: "component.yaml" }),
    resolveRepositoryPaths: await desktopRepositoryAccess.resolveRepositoryPaths({ repositorySession, base: ".", paths: ["src"] }),
    closeRepository: await desktopRepositoryAccess.closeRepository({ repositorySession }),
  };
  for (const [name, definition] of Object.entries(definitions)) {
    const operation = name as keyof RepositoryOperations;
    expect(schemas.compile({ $ref: `${definition}Outcome.json` })(outcomes[operation])).toBe(true);
    expect(repositoryContracts[operation].outcome.safeParse(outcomes[operation]).success).toBe(true);
    expect(outcomes[operation]).toMatchObject({ status: "failure", code: "unavailable" });
  }
});

test("structural requests reject missing fields, incorrect types, and unknown properties", () => {
  const requests = {
    openRepository: { rootPath: "/repo" },
    readRepositoryText: { repositorySession: "repository-1", path: "component.yaml" },
    resolveRepositoryPaths: { repositorySession: "repository-1", base: ".", paths: ["src", "../outside"] },
    closeRepository: { repositorySession: "repository-1" },
  };
  for (const [name, definition] of Object.entries(definitions)) {
    const operation = name as keyof RepositoryOperations;
    const validate = schemas.compile({ $ref: `${definition}Request.json` });
    expect(validate(requests[operation])).toBe(true);
    expect(repositoryContracts[operation].request.safeParse(requests[operation]).success).toBe(true);
    for (const invalid of [null, {}, { ...requests[operation], unexpected: true }]) {
      expect(validate(invalid)).toBe(false);
      expect(repositoryContracts[operation].request.safeParse(invalid).success).toBe(false);
    }
  }
});

test("runtime path rules strengthen the structural contract at the native boundary", () => {
  const structurallyValid = { repositorySession: "repository-1", base: "src/../other", paths: ["file"] };
  expect(schemas.compile({ $ref: "ResolveRepositoryPathsRequest.json" })(structurallyValid)).toBe(true);
  expect(repositoryContracts.resolveRepositoryPaths.request.safeParse(structurallyValid).success).toBe(false);

  const extraBytes = { rootPath: `/${"中".repeat(1366)}` };
  expect(schemas.compile({ $ref: "OpenRepositoryRequest.json" })(extraBytes)).toBe(true);
  expect(repositoryContracts.openRepository.request.safeParse(extraBytes).success).toBe(false);
});

test("native handler wire cases conform to TypeSpec and the frontend validators", () => {
  // Rust's repository_ipc_tests executes and verifies these same cases through
  // the production handlers and capability context, using real temporary files.
  for (const sample of nativeCases) {
    expect(Object.hasOwn(definitions, sample.operation)).toBe(true);
    const operation = sample.operation as keyof RepositoryOperations;
    const definition = definitions[operation];
    expect(schemas.compile({ $ref: `${definition}Request.json` })(sample.request)).toBe(true);
    expect(schemas.compile({ $ref: `${definition}Outcome.json` })(sample.outcome)).toBe(true);
    expect(repositoryContracts[operation].request.safeParse(sample.request).success).toBe(true);
    expect(repositoryContracts[operation].outcome.safeParse(sample.outcome).success).toBe(true);
  }
});
