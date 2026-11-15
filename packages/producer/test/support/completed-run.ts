import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";
import { runCli, toolsRoot } from "./commands.ts";

// A run that Stage 6 completed: the Stage 6 producer fixture, published through
// the producer command line. The model `model` made the readiness review, so the
// LLM call record that Stage 6 saves names that model. Use a fictional model name.
export interface FixtureComponent {
  id: string;
  name: string;
  purpose: { value: string; status: string };
}
export interface FixtureBaseline { id: string; components: FixtureComponent[] }
export interface CompletedRunFixture {
  root: string;
  work: string;
  baselineId: string;
  // The published baseline, relative to the run folder.
  baselinePath: string;
}
type BaselineChange = (baseline: FixtureBaseline) => void;
// The fixture is JavaScript. This local type states only what these tests use.
interface ProducerFixture { root: string; work: string; review: string; baseline: FixtureBaseline }
interface FixtureModule { producerFixture(change?: BaselineChange): ProducerFixture }

const fixtureModule = new URL("../fixtures/entry-points/producer.mjs", import.meta.url);
export const stageSixAttempt = "s6-decisions";

// `change` edits the proposed baseline before Stage 6 starts.
export async function completedRun(model: string, change?: BaselineChange): Promise<CompletedRunFixture> {
  const { producerFixture } = (await import(fixtureModule.href)) as FixtureModule;
  const fixture = producerFixture(change);
  writeFileSync(join(fixture.review, "llm/analysis-call.yaml"), stringify({ provider: "fixture", model, date: "2026-01-01",
    settings: "unknown", hiddenReasoning: "not-saved" }));
  const settings = { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: fixture.work, CHOOM_STAGE6_ID: stageSixAttempt,
    CHOOM_STAGE6: join(fixture.work, "evidence", stageSixAttempt) };
  for (const args of [["start", fixture.review], ["finish"]]) {
    const result = runCli(["stage-6", ...args], settings);
    if (result.status !== 0) throw new Error(`Stage 6 ${args.join(" ")} failed: ${result.stderr}`);
  }
  return { root: fixture.root, work: fixture.work, baselineId: fixture.baseline.id,
    baselinePath: `baselines/${fixture.baseline.id}/baseline.yaml` };
}
