import { describe, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { publishStageFour, stageFourPublication, type StageFourPublication } from "../../fixtures/stage-4-publication/fixture.ts";

// The Stage 4/5 publisher runs as an operator runs it, on a run after Stage 3
// with a complete Stage 4 attempt and a reviewed packet in a separate folder.
function withPublication(use: (fixture: StageFourPublication) => void): void {
  const fixture = stageFourPublication();
  try {
    use(fixture);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

function result(output: { status: number | null; stdout: string; stderr: string }): unknown {
  expect({ status: output.status, stderr: output.stderr }).toEqual({ status: 0, stderr: "" });
  return JSON.parse(output.stdout) as unknown;
}

describe("the Stage 4/5 publisher with a reviewed Stage 4 packet", () => {
  test("checks the packet, publishes it, and verifies the published run", () => {
    withPublication((fixture) => {
      expect(result(publishStageFour(fixture, "check")))
        .toMatchObject({ status: "stage4-review-verified", components: 2, mappedFiles: 2, gaps: 1, writes: [] });
      expect(result(publishStageFour(fixture, "finish"))).toMatchObject({ status: "stage4-published",
        writes: expect.arrayContaining(["publication.json", "baseline.yaml", "discovery.yaml", "run.yaml"]) as unknown });
      const run = parse(readFileSync(join(fixture.work, "run.yaml"), "utf8")) as { progress: Record<string, string> };
      expect(run.progress.componentRecovery).toBe("complete");
      expect(readFileSync(join(fixture.work, "baseline.yaml")).equals(readFileSync(join(fixture.review, "baseline.proposed.yaml"))))
        .toBe(true);
      expect(result(publishStageFour(fixture, "verify"))).toMatchObject({ status: "stage4-publication-verified", writes: [] });
    });
  }, 60_000);
});
