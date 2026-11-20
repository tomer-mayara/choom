import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { inspectStageFour, stageFourAttempt, type StageFourAttempt }
  from "../../packages/producer/test/fixtures/stage-4-publication/fixture.ts";
import { removeScratch } from "../../packages/producer/test/support/commands.ts";

interface GraphReviewWorld extends World {
  graphAttempt: StageFourAttempt;
  prompt: string;
}

After({ tags: "@review-evidence" }, function (this: GraphReviewWorld) {
  if (this.graphAttempt) removeScratch(this.graphAttempt.root);
});

Given("a saved analysis with overlapping graph roots and a dependency outside the snapshot", { timeout: 120_000 },
  function (this: GraphReviewWorld) {
    this.graphAttempt = stageFourAttempt([
      { path: "src/main.ts", text: "import './parse';\n" },
      { path: "src/parse.ts", text: "import 'external-parser';\n" },
      { path: "src/idle.ts", text: "export const idle = true;\n" },
      { path: "tsconfig.json", text: JSON.stringify({ compilerOptions: { module: "ESNext" }, include: ["src/*.ts"] }) },
    ], undefined, "collected", [], { key: "catalog", reviewPaths: [], entryPatterns: ["src/main.ts"], edges: [
      { from: "src/main.ts", to: "src/parse.ts", specifier: "./parse" },
      { from: "src/parse.ts", to: null, specifier: "external-parser" },
    ] });
  });

When("the operator collects the Stage 4 review evidence", { timeout: 120_000 }, function (this: GraphReviewWorld) {
  const collect = inspectStageFour(this.graphAttempt, ["collect"]);
  assert.equal(collect.status, 0, collect.stderr);
  this.prompt = readFileSync(join(this.graphAttempt.attempt, "review-prompt.md"), "utf8");
});

function passRows(prompt: string): string[][] {
  return prompt.split("\n").filter(line => line.startsWith("| `")).map(line => line.slice(2, -2).split(" | "));
}

Then("the saved review prompt shows the scanned files, roots, reached files and stopped edges for each pass by count",
  function (this: GraphReviewWorld) {
    const header = "| Context | Scanned files | Traversal roots | Reached files | Stopped edges | Retained edges | Coverage | Evidence |";
    assert.ok(this.prompt.includes(header), "The saved Stage 4 prompt must label the evidence counts for each graph pass.");
    assert.deepEqual(passRows(this.prompt).map(cells => cells.slice(0, -1)), [
      ["`compiler-1-import`", "3", "1", "2", "1", "2", "partial"],
      ["`compiler-1-require`", "3", "1", "2", "1", "2", "partial"],
      ["`fallback-import`", "2", "0", "0", "0", "0", "partial"],
      ["`fallback-require`", "2", "0", "0", "0", "0", "partial"],
    ]);
  });

Then("the reviewer can identify passes with the same root paths and find the evidence for each pass", function (this: GraphReviewWorld) {
  const groups = this.prompt.split("Passes with identical traversal root paths\n\n")[1]?.split("\n\n")[0];
  assert.deepEqual(groups?.split("\n"), [
    "- `compiler-1-import`, `compiler-1-require`", "- `fallback-import`, `fallback-require`",
  ]);
  const graph = JSON.parse(readFileSync(join(this.graphAttempt.attempt, "graph-results.json"), "utf8")) as { contexts: { id: string }[] };
  assert.deepEqual(passRows(this.prompt).map(cells => [cells[0], cells.at(-1)]),
    graph.contexts.map(({ id }, index) => ["`" + id + "`", "`s4-check-file@graph-results.json#/contexts/" + index + "`"]));
});
