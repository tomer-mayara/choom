import { expect, expectTypeOf, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import type { WorkflowOperations } from "../../../src/architecture/generated/workflow.ts";
import { LoadWorkflow, type SelectedBaseline } from "../../../src/architecture/load-workflow.ts";
import type { LoadWorkflowSnapshot, WorkflowView } from "../../../src/architecture/workspace-view.ts";
import type { Baseline } from "../../../src/domain/generated/contracts.ts";
import type { ReadonlyData } from "../../../src/domain/readonly-data.ts";
import { baselineWorkflowDependencies, pending, selectedBaseline, selectedBaselineText } from "../../support/baseline-workflow-fixtures.ts";

const schema = new Ajv2020({ schemas: [contracts] });
const validateState = schema.compile({ $ref: "WorkflowState.json" });
const validateOutcome = schema.compile({ $ref: "WorkflowOutcome.json" });
type AsyncOperations = { [Name in keyof WorkflowOperations]: () => Promise<ReturnType<WorkflowOperations[Name]>> };

test("the view binds read-only baseline and report commands with immutable observations", () => {
  expectTypeOf<LoadWorkflow>().toExtend<AsyncOperations>();
  expectTypeOf<LoadWorkflow>().toExtend<WorkflowView>();
  expectTypeOf<keyof WorkflowView>().toEqualTypeOf<"openBaseline" | "openDuplicationReport" | "removeDuplicationReport" | "cancel" | "retry" | "getSnapshot" | "subscribe">();
  type Current = NonNullable<LoadWorkflowSnapshot["current"]>;
  expectTypeOf<Current["baseline"]>().toEqualTypeOf<ReadonlyData<Baseline>>();
  expectTypeOf<Current["layout"]["nodes"][number]["position"]>().toEqualTypeOf<{ readonly x: number; readonly y: number }>();
});

test("emitted states and success, busy, cancellation, and failure follow the generated schemas", async () => {
  const dependencies = baselineWorkflowDependencies();
  const workflow = new LoadWorkflow(dependencies);
  const states = [workflow.getSnapshot().state];
  workflow.subscribe(() => { states.push(workflow.getSnapshot().state); });
  const selection = pending<SelectedBaseline | null>();
  dependencies.selectBaseline = () => selection.promise;
  const first = workflow.openBaseline();
  const busy = await workflow.openBaseline();
  const cancel = workflow.cancel();
  selection.resolve(null);
  const cancelled = await first;
  await cancel;
  dependencies.selectBaseline = async () => selectedBaseline();
  const success = await workflow.openBaseline();
  dependencies.selectBaseline = async () => selectedBaselineText("formatVersion: 2");
  const failure = await workflow.openBaseline();
  for (const outcome of [busy, cancelled, success, failure]) expect(validateOutcome(outcome)).toBe(true);
  for (const state of states) expect(validateState(state)).toBe(true);
  expect(validateState({ ...workflow.getSnapshot().state, path: "/private" })).toBe(false);
  expect(validateOutcome({ status: "failure", stage: "layout", code: "failure", message: "Failed", durationMs: -1 })).toBe(false);
});
