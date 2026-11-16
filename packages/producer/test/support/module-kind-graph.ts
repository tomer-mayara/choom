import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collect, loadTools } from "../../src/stage-4-graph.ts";
import type { ModuleKindPackage } from "../fixtures/module-kinds/packages.ts";
import { makeScratch, removeScratch, runCli, toolsRoot } from "./commands.ts";
import { stagedRun } from "./staged-run.ts";

// Builds the Stage 4 graph of a module kind package with the checkout's tools:
// Stage 4 start through the command line saves the graph profile and its notes,
// then collect runs the graph helper on the saved snapshot, as the graph container
// runs it on its input copy.
export type SavedGraph = Awaited<ReturnType<typeof collect>>;
export interface PackageGraph { profile: unknown; notes: unknown; graph: SavedGraph }

const attemptId = "s4-check";
const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/;

// The settings record of a package with compiler options: one parsed configuration
// that selects every source file. Without options, the run keeps the settings record
// of a snapshot without compiler settings, which names the Choom parsing profile.
function settingsOf({ snapshot, compilerOptions }: ModuleKindPackage): Record<string, unknown> | undefined {
  if (compilerOptions === null) return undefined;
  const fileNames = snapshot.map(({ path }) => path).filter((path) => sourceExtension.test(path)).map((path) => "/repo/" + path);
  return { configs: [{ path: "/repo/tsconfig.json", status: "parsed", fileNames, compilerOptions }], parsingProfile: null, gaps: [] };
}

export async function packageGraph(fixture: ModuleKindPackage): Promise<PackageGraph> {
  const scratch = makeScratch();
  try {
    const work = join(scratch, "run");
    stagedRun(work, 3, { snapshot: fixture.snapshot, settings: settingsOf(fixture) });
    const start = runCli(["stage-4", "start"], { CHOOM_TOOLS: toolsRoot, CHOOM_WORK: work, CHOOM_STAGE4_ID: attemptId });
    if (start.status !== 0) throw new Error("Stage 4 start failed: " + start.stderr);
    const saved = (name: string): unknown => JSON.parse(readFileSync(join(work, "evidence", attemptId, name), "utf8"));
    const profile = saved("graph-profile.json");
    const graph = await collect(profile, await loadTools(toolsRoot), join(work, "snapshot"));
    return { profile, notes: saved("graph-profile-notes.json"), graph };
  } finally {
    removeScratch(scratch);
  }
}
