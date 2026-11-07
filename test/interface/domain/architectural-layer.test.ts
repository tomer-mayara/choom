import { expect, expectTypeOf, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import type { AnalysisControl, ArchitecturalLayer } from "../../../src/domain/architectural-layer";
import { architectureDocumentSchema } from "../../../src/domain/architecture-document";
import { buildArchitectureDocument } from "../../../src/domain/build-architecture-document";
import type {
  AnalysisOutcome,
  AnalysisProgress,
  AnalysisRequest,
  ArchitecturalLayerContract,
} from "../../../src/domain/generated/contracts";
import { workspaceObservations } from "../../support/domain-model-fixtures";

const schemas = addFormats(new Ajv2020({ schemas: [contracts] }));
const validateRequest = schemas.compile({ $ref: "AnalysisRequest.json" });
const validateOutcome = schemas.compile({ $ref: "AnalysisOutcome.json" });
const validateProgress = schemas.compile({ $ref: "AnalysisProgress.json" });

test("the asynchronous layer binds the generated data operation to live controls", () => {
  type DataOperation = ArchitecturalLayerContract["analyze"];
  expectTypeOf<Parameters<ArchitecturalLayer["analyze"]>[0]>()
    .toEqualTypeOf<Parameters<DataOperation>[0]>();
  expectTypeOf<Awaited<ReturnType<ArchitecturalLayer["analyze"]>>>()
    .toEqualTypeOf<ReturnType<DataOperation>>();
  expectTypeOf<AnalysisControl["signal"]>().toEqualTypeOf<AbortSignal>();
  expectTypeOf<Parameters<AnalysisControl["onProgress"]>[0]>().toEqualTypeOf<AnalysisProgress>();
});

test("a substitute analyzer uses only neutral request, progress, and result data", async () => {
  const input = workspaceObservations();
  const request: AnalysisRequest = {
    repositorySession: "test-session",
    components: input.components,
    analysis: { enforcer: "example", config: "rules.json", inputs: ["src"] },
  };
  const layer: ArchitecturalLayer = {
    async analyze(received, control) {
      control.onProgress({ stage: "analysis" });
      return {
        status: "success",
        document: buildArchitectureDocument({
          ...input,
          components: received.components,
          analysis: { ...input.analysis, ...received.analysis },
        }),
      };
    },
  };
  const progress: AnalysisProgress[] = [];
  const control: AnalysisControl = {
    signal: new AbortController().signal,
    onProgress: (event) => { progress.push(event); },
  };

  expect(validateRequest(request)).toBe(true);
  const outcome = await layer.analyze(request, control);
  expect(validateOutcome(outcome)).toBe(true);
  expect(progress).toEqual([{ stage: "analysis" }]);
  expect(progress.every((event) => validateProgress(event))).toBe(true);
  if (outcome.status !== "success") throw new Error("The substitute analyzer must succeed.");
  expect(architectureDocumentSchema.parse(outcome.document)).toEqual(outcome.document);
  expect(outcome.document.analysis.enforcer).toBe("example");
  expect(outcome.document.components.map(({ id }) => id)).toEqual([".", "src"]);
});

test("failure and cancellation have distinct generated outcomes", () => {
  const outcomes: AnalysisOutcome[] = [
    { status: "failure", stage: "analysis", code: "execution-failed", message: "Analysis stopped." },
    { status: "cancelled" },
  ];
  for (const outcome of outcomes) expect(validateOutcome(outcome)).toBe(true);
  expect(validateOutcome({ status: "failure", stage: "analysis", message: "Missing code." })).toBe(false);
  expect(validateOutcome({ status: "failure", stage: "analysis", code: "depcruise-exit-1", message: "Failed." }))
    .toBe(false);
  expect(validateOutcome({ status: "cancelled", document: {} })).toBe(false);
  expect(validateRequest({ repositorySession: "test-session", components: [], analysis: {} })).toBe(false);
  expect(validateProgress({ stage: "stderr" })).toBe(false);
});
