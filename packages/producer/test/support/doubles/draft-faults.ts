import { createRequire, syncBuiltinESMExports } from "node:module";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

// A test double for the file system of one producer helper process that publishes the
// working drafts of Stages 2 to 5. A test starts the helper with this module as a Node
// preload (draftFaultSettings) and names the faults in DRAFT_FAULTS. Each fault makes
// one rename of the publication fail, or changes a draft as another writer would. All
// other file operations run as usual, and the helper code stays unchanged. Without
// DRAFT_FAULTS, loading this module changes nothing.
export type DraftFault =
  // The rename of the staged baseline into baseline.yaml fails.
  | "baseline-rename"
  // The rename of the staged discovery into discovery.yaml fails.
  | "discovery-rename"
  // The rename of the staged run manifest into run.yaml fails.
  | "run-rename"
  // The publication stops after this number of renames into working drafts: the next
  // rename fails, whatever draft it replaces.
  | `stop-after-rename-${number}`
  // Another writer changes discovery.yaml just after the publication replaced it.
  | "discovery-change";

export const injectedRenameFailure = "Injected rename failure";
const faultsVariable = "DRAFT_FAULTS";
const drafts = new Set(["run.yaml", "discovery.yaml", "baseline.yaml"]);

// The settings that load this double in the command line and in the helper processes that it starts.
export function draftFaultSettings(faults: readonly DraftFault[]): Record<string, string> {
  return { NODE_OPTIONS: `--import=${pathToFileURL(import.meta.filename).href}`, [faultsVariable]: faults.join(",") };
}

// The file operations that the faults replace or use, from the CommonJS form of
// node:fs. syncBuiltinESMExports gives the replacements to the ES module imports too.
interface FileSystem {
  renameSync(from: string, to: string): void;
  appendFileSync(path: string, text: string): void;
}

function install(faults: ReadonlySet<string>): void {
  const fs = createRequire(import.meta.url)("node:fs") as FileSystem;
  const { renameSync, appendFileSync } = fs;
  // The number of renames after which the publication stops, as text, if a fault names one.
  const stop = [...faults].map((fault) => /^stop-after-rename-([0-9]+)$/.exec(fault)?.[1]).find((count) => count !== undefined);
  let renamed = 0;
  fs.renameSync = (from, to) => {
    // A publication renames a temporary file, whose name starts with a dot, into a working
    // draft. A rollback renames a file whose name holds "rollback".
    const draft = basename(to);
    const publication = basename(from).startsWith(".") && !basename(from).includes("rollback") && drafts.has(draft);
    if (publication && (faults.has(draft.replace(".yaml", "-rename")) || String(renamed) === stop))
      throw new Error(injectedRenameFailure);
    renameSync(from, to);
    if (publication) renamed += 1;
    if (publication && faults.has("discovery-change") && draft === "discovery.yaml") appendFileSync(to, "# changed\n");
  };
  syncBuiltinESMExports();
}

const faults = new Set((process.env[faultsVariable] ?? "").split(",").filter((fault) => fault !== ""));
if (faults.size > 0) install(faults);
