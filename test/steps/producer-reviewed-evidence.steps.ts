import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Given, Then, type World } from "@cucumber/cucumber";
import { parse } from "yaml";
import { inspectStageFour, type StageFourAttempt, stageFourPublication, type StageFourPublication }
  from "../../packages/producer/test/fixtures/stage-4-publication/fixture.ts";
import { type CommandResult, toolsRoot } from "../../packages/producer/test/support/commands.ts";

// The reviewed evidence of a Stage 4 draft. The drafts use the Stage 4 publication
// fixture: its review read line 1 of http.ts, the reviewed range
// s4-check-source-http.ts. producer-recovery.steps.ts publishes the draft, checks
// that nothing changed, and removes the run folder after the scenario.
interface ReviewedEvidenceWorld extends World {
  stageFourRun?: StageFourPublication;
  publishCommand?: CommandResult;
}

type Records = Record<string, Record<string, unknown>>;
interface SourceRange { id: string; path: string; lines: [number, number] }

// The order route of the draft. Its site is line 1 of http.ts, the http component owns the file,
// and the saved launch settings name the route.
const routeId = "s4-check-orders-route";
const routeSite: Omit<SourceRange, "id"> = { path: "http.ts", lines: [1, 1] };
const reviewedRoute = "s4-check-source-http.ts";
// The order path from the route, with one action for each step.
const pathId = "s4-check-orders-path";
const stepActions = ["The handler lists the orders.", "The handler returns the orders to the caller."];

// Requests an excerpt of a range after collect, as an operator does, and returns the
// source ID of the saved excerpt.
function requestExcerpt(attempt: StageFourAttempt, { path, lines: [first, last] }: Omit<SourceRange, "id">): string {
  const request = inspectStageFour(attempt, ["excerpt", path, String(first), String(last)]);
  assert.equal(request.status, 0, request.stderr);
  const name = /^Saved (excerpt-[0-9]+\.json)\.$/m.exec(request.stdout)?.[1];
  assert.ok(name, request.stdout);
  const excerpt = JSON.parse(readFileSync(join(attempt.attempt, name), "utf8")) as SourceRange;
  assert.deepEqual({ path: excerpt.path, lines: excerpt.lines }, { path, lines: [first, last] });
  return excerpt.id;
}

// Makes the excerpt of a file that collect saved a reviewed range of the draft, as when
// the review reads it, and returns its source ID.
function reviewCollectedExcerpt(records: Records, attempt: StageFourAttempt, path: string): string {
  const saved = JSON.parse(readFileSync(join(attempt.attempt, "source-excerpts.json"), "utf8")) as
    { excerpts: (SourceRange & { snapshotRef: string; sha256: string })[] };
  const excerpt = saved.excerpts.find((item) => item.path === path);
  assert.ok(excerpt, `Collect saved no excerpt of ${path}.`);
  const { id, snapshotRef, sha256, lines } = excerpt;
  const entry = records["entry-analysis.yaml"] ?? {};
  entry.reviewedFiles = [...entry.reviewedFiles as SourceRange[], { id, snapshotRef, path, sha256, lines }];
  const units = (records["code-mapping.json"] ?? {}).units as { path: string; inspection: string }[];
  units.forEach((unit) => { if (unit.path === path) unit.inspection = "reviewed"; });
  return id;
}

// Adds the order route, which cites its reviewed range, and the order path from it with
// these components and the evidence of each step.
function addOrderPath(records: Records, componentIds: string[], steps: string[][]): void {
  Object.assign(records["entry-analysis.yaml"] ?? {}, { behaviorEntries: [{ id: routeId, kind: "route",
    expression: "GET /orders", componentRef: "http", source: routeSite, fileEntryRefs: ["cli-candidate"],
    evidenceRefs: [reviewedRoute, "launch-settings#/http/0"] }] });
  Object.assign(records["discovery.proposed.yaml"] ?? {}, { inspectedPaths: [{ id: pathId,
    description: "The HTTP file serves the order route.", entryPointRef: routeId, componentIds, evidenceRefs: [reviewedRoute],
    steps: steps.map((evidenceRefs, index) => ({ action: stepActions[index], evidenceRefs })),
    limits: ["Source inspection only; the path is not a runtime trace."] }] });
}

function refusal(world: ReviewedEvidenceWorld): string {
  assert.ok(world.publishCommand, "Publish the Stage 4 draft first.");
  return world.publishCommand.stderr;
}

Given("a Stage 4 draft whose behavior entry cites a requested excerpt of its lines that no reviewed range names",
  function (this: ReviewedEvidenceWorld) {
    this.stageFourRun = stageFourPublication(() => {}, [], toolsRoot, (records: Records, attempt) => {
      const excerpt = requestExcerpt(attempt, routeSite);
      const entry = records["entry-analysis.yaml"] ?? {};
      const reviewed = entry.reviewedFiles as SourceRange[];
      assert.ok(reviewed.some((range) => range.path === routeSite.path) && reviewed.every((range) => range.id !== excerpt),
        "The review read the site, but no reviewed range names the requested excerpt.");
      entry.behaviorEntries = [{ id: routeId, kind: "route", expression: "GET /orders", componentRef: "http",
        source: routeSite, fileEntryRefs: ["cli-candidate"], evidenceRefs: [excerpt, "launch-settings#/http/0"] }];
    });
  });

Then("the operator is told which behavior entry does not cite a reviewed range", function (this: ReviewedEvidenceWorld) {
  const message = refusal(this);
  assert.ok(message.includes(`Behavior entry ${routeId} does not cite a reviewed range that contains its site.`), message);
});

// The requested excerpt has the path and the lines of the reviewed range of the route, but
// no reviewedFiles item names it.
Given("a Stage 4 draft with an inspected path whose second step cites only an excerpt that no reviewed range names",
  function (this: ReviewedEvidenceWorld) {
    this.stageFourRun = stageFourPublication(() => {}, [], toolsRoot, (records: Records, attempt) => {
      addOrderPath(records, ["http"], [[reviewedRoute], [requestExcerpt(attempt, routeSite)]]);
    });
  });

Then("the operator is told which step of the inspected path has no reviewed source", function (this: ReviewedEvidenceWorld) {
  const message = refusal(this);
  assert.ok(message.includes(`Inspected path ${pathId} step 2 does not cite a reviewed range.`), message);
});

// The review also read the excerpt of cli.ts that collect saved. The second step cites
// that reviewed range and, for its scope, a context of the saved graph.
Given("a Stage 4 draft with an inspected path whose steps each cite a reviewed range", function (this: ReviewedEvidenceWorld) {
  this.stageFourRun = stageFourPublication(() => {}, [], toolsRoot, (records: Records, attempt) => {
    const reviewedStart = reviewCollectedExcerpt(records, attempt, "cli.ts");
    addOrderPath(records, ["http", "cli"], [[reviewedRoute], [reviewedStart, "s4-check-file@graph-results.json#/contexts/0"]]);
  });
});

Then("the Stage 4 draft is published with the inspected path", function (this: ReviewedEvidenceWorld) {
  assert.ok(this.publishCommand && this.stageFourRun, "Publish the Stage 4 draft first.");
  assert.equal(this.publishCommand.status, 0, this.publishCommand.stderr);
  const discovery = parse(readFileSync(join(this.stageFourRun.work, "discovery.yaml"), "utf8")) as
    { inspectedPaths: { id: string; componentIds: string[] }[] };
  assert.deepEqual(discovery.inspectedPaths.map(({ id, componentIds }) => ({ id, componentIds })),
    [{ id: pathId, componentIds: ["http", "cli"] }]);
});
