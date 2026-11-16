import { afterAll, beforeAll } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type ExtraFile, inspectStageFour, type StageFourAttempt, stageFourAttempt }
  from "../fixtures/stage-4-publication/fixture.ts";

// A Stage 4 attempt for the tests of a suite. Before the tests, Stage 4 start, the
// graph phases and collect run once on a run after Stage 3 with the extra snapshot
// files and the copied Knip plugin patterns of Stage 2; after the tests, the attempt
// is removed.
export interface CollectedAttempt {
  attempt(): StageFourAttempt;
  // A JSON file that the attempt saved.
  saved(name: string): Record<string, unknown>;
}

export function collectedAttempt(files: readonly ExtraFile[], pluginEntryPatterns: readonly unknown[] = []): CollectedAttempt {
  let fixture: StageFourAttempt | undefined;
  beforeAll(() => {
    fixture = stageFourAttempt(files, undefined, undefined, pluginEntryPatterns);
    const collect = inspectStageFour(fixture, ["collect"]);
    if (collect.status !== 0) throw new Error("Stage 4 collect failed: " + collect.stderr);
  }, 120_000);
  afterAll(() => {
    if (fixture !== undefined) rmSync(fixture.root, { recursive: true, force: true });
  });
  const attempt = (): StageFourAttempt => {
    if (fixture === undefined) throw new Error("The Stage 4 attempt of the suite is not ready.");
    return fixture;
  };
  return { attempt, saved: (name) => JSON.parse(readFileSync(join(attempt().attempt, name), "utf8")) as Record<string, unknown> };
}
