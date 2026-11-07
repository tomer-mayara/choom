import assert from "node:assert/strict";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import type { AnalysisControl, ArchitecturalLayer } from "../../src/domain/architectural-layer.ts";
import type { AnalysisOutcome, AnalysisProgress } from "../../src/domain/generated/contracts.ts";
import { createArchitecturalLayer } from "../../src/architecture/create-architectural-layer.ts";
import { DepCruiserArchitecturalLayer } from "../../src/architecture/dependency-cruiser/architectural-layer.ts";
import { DepCruiserReportConverter } from "../../src/architecture/dependency-cruiser/converter.ts";
import { DesktopDepCruiserRunner } from "../../src/architecture/dependency-cruiser/runner.ts";
import type { DepCruiserNativeFailureCode } from "../../src/platform/generated/contracts.ts";
import { converterFixture, syncReport } from "../support/converter-fixtures.ts";
import { deferred, NativeAnalyzerDouble, nativeFailure } from "../support/execution-fixtures.ts";

interface ExecutionWorld extends World {
  fixture: ReturnType<typeof converterFixture>;
  native: NativeAnalyzerDouble;
  abort: AbortController;
  progress: AnalysisProgress[];
  control: AnalysisControl;
  layer: ArchitecturalLayer;
  outcome: AnalysisOutcome;
  pending?: Promise<AnalysisOutcome>;
  conversionGate?: ReturnType<typeof deferred<void>>;
  conversionStarted: ReturnType<typeof deferred<void>>;
  conversions: number;
  nodeExecutable?: string;
  observerThrows?: boolean;
}

function initialize(world: ExecutionWorld): void {
  world.fixture = converterFixture();
  world.native = new NativeAnalyzerDouble(world.fixture.input.completed.json);
  world.abort = new AbortController();
  world.progress = [];
  world.conversions = 0;
  world.conversionStarted = deferred<void>();
  world.control = { signal: world.abort.signal, onProgress: (progress) => {
    world.progress.push(progress);
    if (world.observerThrows && progress.stage === "analysis") throw new Error("Observer failed.");
  } };
  bindLayer(world);
}

function bindLayer(world: ExecutionWorld): void {
  const converter = new DepCruiserReportConverter(world.fixture.repository);
  world.layer = new DepCruiserArchitecturalLayer(new DesktopDepCruiserRunner(world.native, world.nodeExecutable === undefined ? {} : { nodeExecutable: world.nodeExecutable }), {
    convert: async (input) => {
      world.conversions += 1;
      world.conversionStarted.resolve();
      await world.conversionGate?.promise;
      return converter.convert(input);
    },
  });
}

function refreshReport(world: ExecutionWorld): void {
  syncReport(world.fixture);
  assert.equal(world.native.result.status, "completed");
  if (world.native.result.status === "completed") world.native.result.reportJson = world.fixture.input.completed.json;
}

function supportedProblem(problem: string): DepCruiserNativeFailureCode {
  switch (problem) {
    case "node-not-found": case "unsupported-node": case "analyzer-not-found": case "unsupported-analyzer":
    case "unsupported-config-path": case "execution-failed": case "timed-out": case "output-limit": case "report-missing": case "report-invalid": return problem;
    default: return assert.fail(`Unknown execution scenario problem: ${problem}`);
  }
}

Given("a repository declares one workspace component for two source directories", function (this: ExecutionWorld) {
  initialize(this);
});

Given("its next completed analysis reports an import to a declared package", function (this: ExecutionWorld) {
  this.fixture.report.modules.push({ source: "src/lib/format.ts", dependencies: [{ module: "@core/model/entity", resolved: "packages/core/model/entity.ts", dependencyTypes: ["local"] }] });
  refreshReport(this);
});

Given("the next completed analysis reports an error rule finding", function (this: ExecutionWorld) {
  initialize(this);
  this.fixture.report.summary.violations = [{ type: "dependency", from: "src/components/panel.ts", to: "packages/core/model/entity.ts", rule: { name: "no-workspace-core", severity: "error" } }];
  refreshReport(this);
});

Given("native analysis reports {string}", function (this: ExecutionWorld, problem: string) {
  initialize(this);
  this.native.result = nativeFailure(supportedProblem(problem));
});

Given("native execution completes with malformed report JSON", function (this: ExecutionWorld) {
  initialize(this);
  assert.equal(this.native.result.status, "completed");
  if (this.native.result.status === "completed") this.native.result.reportJson = '{"modules":';
});

Given("repository analysis is {string}", async function (this: ExecutionWorld, phase: string) {
  initialize(this);
  if (phase === "awaiting job preparation") {
    this.native.prepareGate = deferred();
    this.pending = this.layer.analyze(this.fixture.input.request, this.control);
    await this.native.prepared.promise;
  } else if (phase === "running the analyzer") {
    this.native.runGate = deferred();
    this.pending = this.layer.analyze(this.fixture.input.request, this.control);
    await this.native.started.promise;
  } else assert.fail(`Unknown execution phase: ${phase}`);
});

Given("the analysis request has already been cancelled", function (this: ExecutionWorld) {
  initialize(this);
  this.abort.abort();
});

Given("completed analysis is being converted", async function (this: ExecutionWorld) {
  initialize(this);
  this.conversionGate = deferred();
  this.pending = this.layer.analyze(this.fixture.input.request, this.control);
  await this.conversionStarted.promise;
});

Given("cancellation cannot clean up the native analysis job", async function (this: ExecutionWorld) {
  initialize(this);
  this.native.runGate = deferred();
  this.native.cancelResult = nativeFailure("cleanup-failed");
  this.native.releaseResult = nativeFailure("cleanup-failed");
  this.pending = this.layer.analyze(this.fixture.input.request, this.control);
  await this.native.started.promise;
});

Given("the next native analysis completes successfully", function (this: ExecutionWorld) {
  initialize(this);
});

Given("the progress observer throws while analysis is running", function (this: ExecutionWorld) {
  initialize(this);
  this.observerThrows = true;
});

Given("the architectural layer is used without the desktop host", function (this: ExecutionWorld) {
  initialize(this);
  this.layer = createArchitecturalLayer();
});

Given("an absolute Node executable is configured for analysis", function (this: ExecutionWorld) {
  initialize(this);
  this.nodeExecutable = "/configured/runtime/node";
  bindLayer(this);
});

When("I analyze the repository through the architectural layer", async function (this: ExecutionWorld) {
  this.outcome = await this.layer.analyze(this.fixture.input.request, this.control);
});

When("I cancel that analysis", async function (this: ExecutionWorld) {
  assert.ok(this.pending);
  this.abort.abort();
  this.native.prepareGate?.resolve({ status: "success", value: { jobId: "analysis-1" } });
  this.conversionGate?.resolve();
  this.outcome = await this.pending;
});

Then("the document contains the new component relationship", function (this: ExecutionWorld) {
  assert.equal(this.outcome.status, "success");
  if (this.outcome.status !== "success") return;
  assert.deepEqual(this.outcome.document.relationships.map(({ source, target }) => ({ source, target })), [{ source: "src", target: "packages/core" }]);
  assert.equal(this.outcome.document.relationships[0]?.evidence.length, 2);
});

Then("it contains only the declared components", function (this: ExecutionWorld) {
  assert.equal(this.outcome.status, "success");
  if (this.outcome.status === "success") assert.deepEqual(this.outcome.document.components.map(({ id }) => id), [".", "packages/core", "src"]);
});

Then("the architecture document retains the finding and its import", function (this: ExecutionWorld) {
  assert.equal(this.outcome.status, "success");
  if (this.outcome.status !== "success") return;
  assert.equal(this.outcome.document.relationships.length, 1);
  assert.ok(this.outcome.document.diagnostics.some(({ rule, severity }) => rule === "no-workspace-core" && severity === "error"));
});

Then("analysis fails with an explanation of {string}", function (this: ExecutionWorld, problem: string) {
  assert.equal(this.outcome.status, "failure");
  if (this.outcome.status === "failure") assert.ok(this.outcome.message.includes(problem));
});

Then("no completed report is converted", function (this: ExecutionWorld) { assert.equal(this.conversions, 0); });

Then("analysis fails at conversion without a document", function (this: ExecutionWorld) {
  assert.equal(this.outcome.status, "failure");
  if (this.outcome.status === "failure") assert.equal(this.outcome.stage, "conversion");
});

Then("it ends as cancelled after its native job is cleaned up", function (this: ExecutionWorld) {
  assert.deepEqual(this.outcome, { status: "cancelled" });
  assert.ok(this.native.clean && this.native.released);
});

Then("no architecture document is returned", function (this: ExecutionWorld) { assert.notEqual(this.outcome.status, "success"); });
Then("its outcome is cancelled", function (this: ExecutionWorld) { assert.deepEqual(this.outcome, { status: "cancelled" }); });

Then("it ends as cancelled without preparing a native job", function (this: ExecutionWorld) {
  assert.deepEqual(this.outcome, { status: "cancelled" });
  assert.equal(this.native.preparations.length, 0);
});

Then("analysis fails at cleanup with a useful explanation", function (this: ExecutionWorld) {
  assert.equal(this.outcome.status, "failure");
  if (this.outcome.status === "failure") {
    assert.equal(this.outcome.stage, "cleanup");
    assert.ok(/clean/i.test(this.outcome.message));
  }
});

Then("its native job is released", function (this: ExecutionWorld) { assert.ok(this.native.released); });
Then("its repository session remains open", function (this: ExecutionWorld) { assert.ok(this.fixture.repository.activeSessions.has("repository-1")); });

Then("progress includes setup, analysis, conversion, and validation", function (this: ExecutionWorld) {
  const stages = new Set(this.progress.map(({ stage }) => stage));
  for (const stage of ["setup", "analysis", "conversion", "validation"]) assert.ok(stages.has(stage as AnalysisProgress["stage"]));
});

Then("elapsed times are nonnegative and do not decrease", function (this: ExecutionWorld) {
  let elapsed = 0;
  for (const progress of this.progress) {
    assert.ok(progress.elapsedMs !== undefined && progress.elapsedMs >= elapsed);
    elapsed = progress.elapsedMs;
  }
});

Then("the operation returns a terminal outcome", function (this: ExecutionWorld) { assert.ok(["success", "failure", "cancelled"].includes(this.outcome.status)); });

Then("analysis fails with a desktop availability explanation", function (this: ExecutionWorld) {
  assert.equal(this.outcome.status, "failure");
  if (this.outcome.status === "failure") assert.match(this.outcome.message, /desktop/i);
});

Then("native preparation receives that executable selection", function (this: ExecutionWorld) {
  assert.equal(this.native.preparations[0]?.nodeExecutable, this.nodeExecutable);
});

Then("it receives the declared configuration and literal inputs", function (this: ExecutionWorld) {
  assert.equal(this.native.preparations[0]?.config, this.fixture.input.request.analysis.config);
  assert.deepEqual(this.native.preparations[0]?.inputs, this.fixture.input.request.analysis.inputs);
});
