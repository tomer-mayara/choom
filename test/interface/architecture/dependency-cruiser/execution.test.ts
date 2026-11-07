import { expect, expectTypeOf, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import contracts from "../../../../cookbook/interfaces/generated/contracts.schema.json";
import type { AnalysisControl, ArchitecturalLayer } from "../../../../src/domain/architectural-layer.ts";
import { DepCruiserArchitecturalLayer } from "../../../../src/architecture/dependency-cruiser/architectural-layer.ts";
import { DepCruiserReportConverter } from "../../../../src/architecture/dependency-cruiser/converter.ts";
import type { DepCruiserExecution } from "../../../../src/architecture/dependency-cruiser/execution.ts";
import type { DepCruiserExecutionOperations } from "../../../../src/architecture/dependency-cruiser/generated/contracts.ts";
import { DesktopDepCruiserRunner } from "../../../../src/architecture/dependency-cruiser/runner.ts";
import type { createArchitecturalLayer } from "../../../../src/architecture/create-architectural-layer.ts";
import { converterFixture } from "../../../support/converter-fixtures.ts";
import { NativeAnalyzerDouble } from "../../../support/execution-fixtures.ts";

const schemas = addFormats(new Ajv2020({ schemas: [contracts] }));

test("the concrete execution binding retains generated data with live analysis controls", () => {
  expectTypeOf<Parameters<DepCruiserExecution["run"]>[0]>().toEqualTypeOf<Parameters<DepCruiserExecutionOperations["run"]>[0]>();
  expectTypeOf<Parameters<DepCruiserExecution["run"]>[1]>().toEqualTypeOf<AnalysisControl>();
  expectTypeOf<Awaited<ReturnType<DepCruiserExecution["run"]>>>().toEqualTypeOf<ReturnType<DepCruiserExecutionOperations["run"]>>();
  expectTypeOf<DepCruiserArchitecturalLayer>().toMatchTypeOf<ArchitecturalLayer>();
  expectTypeOf<ReturnType<typeof createArchitecturalLayer>>().toEqualTypeOf<ArchitecturalLayer>();
});

test("native execution facts become the existing completed-report contract and a neutral document", async () => {
  const fixture = converterFixture();
  const control = { signal: new AbortController().signal, onProgress: () => {} };
  const runner = new DesktopDepCruiserRunner(new NativeAnalyzerDouble(fixture.input.completed.json));
  const request = { repositorySession: fixture.input.request.repositorySession, config: fixture.input.request.analysis.config, inputs: fixture.input.request.analysis.inputs };
  expect(schemas.compile({ $ref: "DepCruiserExecutionRequest.json" })(request)).toBe(true);
  const completed = await runner.run(request, control);
  expect(schemas.compile({ $ref: "DepCruiserRunOutcome.json" })(completed)).toBe(true);
  expect(completed.status).toBe("completed");
  if (completed.status !== "completed") return;
  expect(schemas.compile({ $ref: "CompletedDepCruiserReport.json" })(completed.report)).toBe(true);
  expect(completed.report.generatedAt).toBe("2026-11-06T12:00:00.000Z");
  const layer: ArchitecturalLayer = new DepCruiserArchitecturalLayer(runner, new DepCruiserReportConverter(fixture.repository));
  const outcome = await layer.analyze(fixture.input.request, control);
  expect(outcome.status).toBe("success");
  expect(schemas.compile({ $ref: "AnalysisOutcome.json" })(outcome)).toBe(true);
});
