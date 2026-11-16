import { join } from "node:path";
import { type CommandResult, runCli, toolsRoot } from "./commands.ts";

// Stage 6 on the Stage 6 producer fixture (fixtures/entry-points/producer.mjs): a
// run after Stage 5 with a reviewed readiness packet in a separate folder. The
// actions run through the producer command line, as an operator runs them, so
// these helpers do not name the file of the Stage 6 helper.
export interface StageSixFixture<Baseline = BaselineId> {
  root: string;
  // The run folder and the folder of the readiness packet.
  work: string;
  review: string;
  // The proposed baseline of the drafts.
  baseline: Baseline;
}
interface BaselineId { id: string }
// The fixture is JavaScript. Each caller states the baseline fields that it uses.
interface FixtureModule<Baseline> { producerFixture(change?: (baseline: Baseline) => void): StageSixFixture<Baseline> }

const fixtureModule = new URL("../fixtures/entry-points/producer.mjs", import.meta.url);

// A new copy of the fixture in a scratch folder. `change` edits the proposed
// baseline before the fixture saves the drafts.
export async function stageSixFixture<Baseline = BaselineId>(change?: (baseline: Baseline) => void):
Promise<StageSixFixture<Baseline>> {
  const { producerFixture } = (await import(fixtureModule.href)) as FixtureModule<Baseline>;
  return producerFixture(change);
}

// The settings of the Stage 6 attempt `id` of the run in `work`.
function stageSixSettings(work: string, id: string): Record<string, string> {
  return { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work, CHOOM_STAGE6_ID: id, CHOOM_STAGE6: join(work, "evidence", id) };
}

// Runs one Stage 6 action of the attempt `id` with the command line of `tools`.
// `settings` replaces or adds settings.
export function stageSix(work: string, id: string, args: readonly string[], settings: Record<string, string> = {},
  tools = toolsRoot): CommandResult {
  return runCli(["stage-6", ...args], { ...stageSixSettings(work, id), ...settings }, tools);
}
