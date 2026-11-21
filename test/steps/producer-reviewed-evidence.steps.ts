import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Given, Then, type World } from "@cucumber/cucumber";
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
  assert.ok(this.publishCommand, "Publish the Stage 4 draft first.");
  const message = this.publishCommand.stderr;
  assert.ok(message.includes(`Behavior entry ${routeId} does not cite a reviewed range that contains its site.`), message);
});
