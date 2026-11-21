import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { parse } from "yaml";
import { type ExtraFile, publishStageFour, stageFourPublication, type StageFourPublication }
  from "../../packages/producer/test/fixtures/stage-4-publication/fixture.ts";
import { removeScratch, runCli } from "../../packages/producer/test/support/commands.ts";

interface InspectionWorld extends World {
  files: ExtraFile[];
  mapping: StageFourPublication;
  reviewFolder: string;
  reviewPrompt: string;
}

const attemptId = "s5-ownership-review";
const earlierPath = "src/queue.ts";
interface Range { sourceRef: string; recordRef: string; lines: number[] }
interface CoverageUnit {
  path: string; sha256: string; current: { ranges: Range[] }; historicalRanges: (Range & { analysisRef: string })[];
}

function citedUnits<Unit>(world: InspectionWorld, file: string): Unit[] {
  const ref = attemptId + "-file@" + file;
  assert.ok(world.reviewPrompt.includes(ref + "#/units"));
  const { artifacts } = JSON.parse(readFileSync(join(world.reviewFolder, "artifact-map.json"), "utf8"));
  return JSON.parse(readFileSync(join(world.mapping.work, artifacts[ref].path), "utf8")).units;
}

After({ tags: "@review-evidence" }, function (this: InspectionWorld) {
  if (this.mapping) removeScratch(this.mapping.root);
});

Given("a saved mapping with files that have owners and files with unknown owners", { timeout: 120_000 },
  function (this: InspectionWorld) {
    this.files = [{ path: "README.md", text: "# Service\n", priorReview: { stage: 1, lines: [1, 1] } }];
  });

Given("an earlier stage reviewed a file outside the selected Stage 4 ranges", { timeout: 120_000 },
  function (this: InspectionWorld) {
    this.files.push({ path: earlierPath, text: "export const queue = [];\nqueue.push('order');\n",
      priorReview: { stage: 3, lines: [2, 2] } });
    this.mapping = stageFourPublication(undefined, this.files);
    const result = publishStageFour(this.mapping, "finish");
    assert.equal(result.status, 0, result.stderr);
  });

When("the operator collects the Stage 5 review evidence", { timeout: 120_000 }, function (this: InspectionWorld) {
  this.reviewFolder = join(this.mapping.work, "evidence", attemptId);
  const env = { CHOOM_TOOLS: this.mapping.tools, CHOOM_WORK: this.mapping.work, CHOOM_STAGE5_ID: attemptId,
    CHOOM_STAGE5: this.reviewFolder };
  for (const action of ["start", "collect"]) {
    const result = runCli(["stage-5", action], env, this.mapping.tools);
    assert.equal(result.status, 0, result.stderr);
  }
  this.reviewPrompt = readFileSync(join(this.reviewFolder, "review-prompt.md"), "utf8");
});

Then("the saved prompt counts files in each ownership group by where a reviewed source range was recorded",
  function (this: InspectionWorld) {
    assert.ok(this.reviewPrompt.includes("| Proposed owner | 1 | 0 | 1 |"));
    assert.ok(this.reviewPrompt.includes("| Unknown owner | 0 | 1 | 1 |"), "One unknown owner's file was reviewed only by Stage 3.");
    assert.ok(this.reviewPrompt.includes("| Ownership | Selected Stage 4 range | Earlier entry analyses only | No range in entry-analysis history |"));
    assert.ok(this.reviewPrompt.includes("Stage 1 role reviews are recorded separately."));
    const { excerpts } = JSON.parse(readFileSync(join(this.reviewFolder, "source-excerpts.json"), "utf8"));
    assert.ok(excerpts.some((excerpt: { path: string }) => excerpt.path === "README.md"));
  });

Then("the reviewer can find files with only earlier ranges or no range in the entry-analysis history", function (this: InspectionWorld) {
  const units = citedUnits<CoverageUnit>(this, "inspection-coverage.json");
  const earlier = units.filter(unit => !unit.current.ranges.length && unit.historicalRanges.length);
  assert.deepEqual(earlier.map(unit => unit.path), [earlierPath]);
  const readme = units.find(unit => unit.path === "README.md");
  assert.deepEqual(readme?.current.ranges, []);
  assert.deepEqual(readme?.historicalRanges, []);
  const remaining = citedUnits<{ path: string }>(this, "remaining-units.json");
  assert.deepEqual(remaining.map(unit => unit.path).sort(), ["README.md", earlierPath]);
});

Then("the historical-only file points to its reviewed range in the earlier entry analysis", function (this: InspectionWorld) {
  const unit = citedUnits<CoverageUnit>(this, "inspection-coverage.json").find(item => item.path === earlierPath);
  assert.ok(unit);
  assert.equal(unit.historicalRanges.length, 1);
  const [range] = unit.historicalRanges;
  assert.ok(range);
  const { artifacts } = parse(readFileSync(join(this.mapping.work, "run.yaml"), "utf8"));
  const review = (ref: string) => parse(readFileSync(join(this.mapping.work, artifacts[ref].path), "utf8"));
  const { selectedEntryAnalysisRef } = JSON.parse(readFileSync(join(this.reviewFolder, "inspection-coverage.json"), "utf8"));
  assert.equal(range.analysisRef, review(selectedEntryAnalysisRef).previousEntryAnalysisRef);
  const records = review(range.analysisRef).reviewedFiles as { id: string; path: string; sha256: string; lines: number[] }[];
  const index = records.findIndex(record => record.id === range.sourceRef);
  assert.equal(range.recordRef, range.analysisRef + "#/reviewedFiles/" + index);
  const source = records[index];
  assert.ok(source);
  assert.equal(source.path, earlierPath);
  assert.equal(source.sha256, unit.sha256);
  assert.deepEqual(source.lines, [2, 2]);
  assert.deepEqual(range.lines, source.lines);
  assert.deepEqual(review("review-001").reviewedFiles.map((item: { path: string }) => item.path), ["README.md"]);
});
