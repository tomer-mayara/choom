import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { publishStageFour, stageFourPublication, type StageFourPublication }
  from "../../packages/producer/test/fixtures/stage-4-publication/fixture.ts";
import { removeScratch, runCli } from "../../packages/producer/test/support/commands.ts";

interface InspectionWorld extends World {
  mapping: StageFourPublication;
  reviewFolder: string;
  reviewPrompt: string;
}

const attemptId = "s5-ownership-review";

After({ tags: "@review-evidence" }, function (this: InspectionWorld) {
  if (this.mapping) removeScratch(this.mapping.root);
});

Given("a saved mapping with files that have owners and files with unknown owners", { timeout: 120_000 },
  function (this: InspectionWorld) {
    this.mapping = stageFourPublication(undefined, [{ path: "README.md", text: "# Service\n" }]);
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
    assert.ok(this.reviewPrompt.includes("| Ownership | Selected Stage 4 range | Historical ranges only | No recorded range |"));
    assert.ok(this.reviewPrompt.includes("| Proposed owner | 1 | 0 | 1 |"));
    assert.ok(this.reviewPrompt.includes("| Unknown owner | 0 | 0 | 1 |"));
    const { excerpts } = JSON.parse(readFileSync(join(this.reviewFolder, "source-excerpts.json"), "utf8"));
    assert.ok(excerpts.some((excerpt: { path: string }) => excerpt.path === "README.md"));
  });

Then("the reviewer can find files with only earlier ranges or with no recorded inspection", function (this: InspectionWorld) {
  const { artifacts } = JSON.parse(readFileSync(join(this.reviewFolder, "artifact-map.json"), "utf8"));
  for (const file of ["inspection-coverage.json", "remaining-units.json"]) {
    const ref = attemptId + "-file@" + file;
    assert.ok(this.reviewPrompt.includes(ref + "#/units"));
    const { units } = JSON.parse(readFileSync(join(this.mapping.work, artifacts[ref].path), "utf8"));
    assert.ok(units.some((unit: { path: string }) => unit.path === "README.md"));
  }
});
