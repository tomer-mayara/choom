import { expect, expectTypeOf, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import type { z } from "zod";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import nativeCases from "../../fixtures/analyzer-native.json";
import { DesktopAnalyzerAccess, type AnalyzerAccess } from "../../../src/platform/analyzer.ts";
import { analyzerContracts } from "../../../src/platform/analyzer-contract.ts";
import type { DepCruiserNativeProgress, DepCruiserOperations } from "../../../src/platform/generated/contracts.ts";

const schemas = new Ajv2020({ schemas: [contracts] });
const definitions = {
  prepareDepCruiser: { request: "PrepareDepCruiserRequest", outcome: "PrepareDepCruiserOutcome" },
  runDepCruiser: { request: "DepCruiserJob", outcome: "DepCruiserExecutionOutcome" },
  cancelDepCruiser: { request: "DepCruiserJob", outcome: "CancelDepCruiserOutcome" },
  releaseDepCruiser: { request: "DepCruiserJob", outcome: "ReleaseDepCruiserOutcome" },
} as const;

type RuntimeOperations = { [Name in keyof DepCruiserOperations]: (
  request: z.output<(typeof analyzerContracts)[Name]["request"]>
) => z.output<(typeof analyzerContracts)[Name]["outcome"]> };
type LogicalOperations = { [Name in keyof DepCruiserOperations]: (
  request: Parameters<AnalyzerAccess[Name]>[0]
) => Awaited<ReturnType<AnalyzerAccess[Name]>> };

test("native operation and progress bindings conform to generated TypeSpec data", () => {
  expectTypeOf<RuntimeOperations>().toEqualTypeOf<DepCruiserOperations>();
  expectTypeOf<LogicalOperations>().toEqualTypeOf<DepCruiserOperations>();
  expectTypeOf<z.output<typeof analyzerContracts.progress>>().toEqualTypeOf<DepCruiserNativeProgress>();
});

test("shared native handler wire cases conform at the platform boundary", () => {
  // Native IPC tests execute the same sequence; this verifies the wire format,
  // including the deliberately invalid request that native code must reject.
  for (const sample of nativeCases) {
    expect(Object.hasOwn(definitions, sample.operation)).toBe(true);
    const name = sample.operation as keyof DepCruiserOperations;
    const definition = definitions[name];
    const validRequest = !(sample.outcome.status === "failure" && sample.outcome.code === "invalid-request");
    expect(schemas.compile({ $ref: `${definition.request}.json` })(sample.request)).toBe(validRequest);
    expect(analyzerContracts[name].request.safeParse(sample.request).success).toBe(validRequest);
    expect(schemas.compile({ $ref: `${definition.outcome}.json` })(sample.outcome)).toBe(true);
    expect(analyzerContracts[name].outcome.safeParse(sample.outcome).success).toBe(true);
  }
});

test("browser absence is a valid outcome for every analyzer operation", async () => {
  const access = new DesktopAnalyzerAccess(async () => { throw new Error("No native host"); }, () => false);
  const job = { jobId: "analysis-1" };
  const outcomes = {
    prepareDepCruiser: await access.prepareDepCruiser({ repositorySession: "repository-1", config: "rules.cjs", inputs: ["src"] }),
    runDepCruiser: await access.runDepCruiser(job),
    cancelDepCruiser: await access.cancelDepCruiser(job),
    releaseDepCruiser: await access.releaseDepCruiser(job),
  };
  for (const [key, definition] of Object.entries(definitions)) {
    const name = key as keyof DepCruiserOperations;
    expect(outcomes[name]).toMatchObject({ status: "failure", code: "unavailable" });
    expect(schemas.compile({ $ref: `${definition.outcome}.json` })(outcomes[name])).toBe(true);
  }
});

test("closed wire data rejects incorrect fields and time values", () => {
  const job = { jobId: "analysis-1" };
  const progress = { ...job, stage: "setup", elapsedMs: 0 };
  const valid = schemas.compile({ $ref: "DepCruiserNativeProgress.json" });
  expect(valid(progress)).toBe(true);
  expect(analyzerContracts.progress.safeParse(progress).success).toBe(true);
  for (const input of [{ ...progress, elapsedMs: -1 }, { ...progress, stage: "stderr" }, { ...progress, path: "/private" }]) {
    expect(valid(input)).toBe(false);
    expect(analyzerContracts.progress.safeParse(input).success).toBe(false);
  }
  const complete = { status: "completed", reportJson: "{}", version: "18.7.2", workingDirectory: ".", completedAtMs: 253_402_300_799_999, durationMs: 0 };
  const outcome = schemas.compile({ $ref: "DepCruiserExecutionOutcome.json" });
  expect(outcome(complete)).toBe(true);
  expect(analyzerContracts.runDepCruiser.outcome.safeParse(complete).success).toBe(true);
  complete.completedAtMs += 1;
  expect(outcome(complete)).toBe(false);
  expect(analyzerContracts.runDepCruiser.outcome.safeParse(complete).success).toBe(false);
});
