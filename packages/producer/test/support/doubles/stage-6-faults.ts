import { createRequire, syncBuiltinESMExports } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// A test double for the file system of one Stage 6 helper process. A test starts
// the helper with this module as a Node preload (faultSettings) and names the
// faults in STAGE6_FAULTS. Each fault makes one file operation of the helper fail,
// or changes a file as another writer would, at a fixed point of a start or a
// publication. All other file operations run as usual, and the helper code stays
// unchanged. Without STAGE6_FAULTS, loading this module changes nothing.
export type StageSixFault =
  // The first rename of the staged discovery into the working discovery fails.
  | "discovery-rename"
  // The rename of the staged run manifest into run.yaml fails.
  | "run-rename"
  // Another writer changes the fixed baseline just after the working discovery is replaced.
  | "baseline-change"
  // Another writer changes the working run.yaml just after start opens its first checkpoint.
  | "draft-change"
  // The removal of the publication lock fails.
  | "lock-removal";

export const injectedRenameFailure = "Injected rename failure";
export const injectedLockRemovalFailure = "Injected lock removal failure";
const faultsVariable = "STAGE6_FAULTS";

// The settings that load this double in the command line and in the helper process that it starts.
export function faultSettings(faults: readonly StageSixFault[]): Record<string, string> {
  return { NODE_OPTIONS: `--import=${pathToFileURL(import.meta.filename).href}`, [faultsVariable]: faults.join(",") };
}

// The file operations that the faults replace or use, from the CommonJS form of
// node:fs. syncBuiltinESMExports gives the replacements to the ES module imports too.
interface FileSystem {
  renameSync(from: string, to: string): void;
  rmdirSync(path: string): void;
  openSync(path: string, flags: string | number, mode?: number): number;
  appendFileSync(path: string, text: string): void;
  readdirSync(path: string): string[];
}

function install(faults: ReadonlySet<string>): void {
  const fs = createRequire(import.meta.url)("node:fs") as FileSystem;
  const { renameSync, rmdirSync, openSync, appendFileSync, readdirSync } = fs;
  let discoveryRenames = 0;
  fs.renameSync = (from, to) => {
    if (from.endsWith("/.stage-6-discovery.next.yaml") && ++discoveryRenames === 1) {
      if (faults.has("discovery-rename")) throw new Error(injectedRenameFailure);
      renameSync(from, to);
      // The run folder holds one fixed baseline folder.
      const baselines = join(dirname(to), "baselines");
      if (faults.has("baseline-change")) appendFileSync(join(baselines, readdirSync(baselines)[0] ?? "", "baseline.yaml"), "# changed\n");
      return;
    }
    if (from.endsWith("/.stage-6-run.next.yaml") && faults.has("run-rename")) throw new Error(injectedRenameFailure);
    renameSync(from, to);
  };
  fs.rmdirSync = (path) => {
    if (path.endsWith("/.stage-6-publish.lock") && faults.has("lock-removal")) throw new Error(injectedLockRemovalFailure);
    rmdirSync(path);
  };
  fs.openSync = (path, flags, mode) => {
    const descriptor = openSync(path, flags, mode);
    // A checkpoint is evidence/<attempt>/run.before.yaml in the run folder.
    if (faults.has("draft-change") && flags === "wx" && path.endsWith("/run.before.yaml"))
      appendFileSync(join(dirname(path), "../../run.yaml"), "# changed\n");
    return descriptor;
  };
  syncBuiltinESMExports();
}

const faults = new Set((process.env[faultsVariable] ?? "").split(",").filter((fault) => fault !== ""));
if (faults.size > 0) install(faults);
