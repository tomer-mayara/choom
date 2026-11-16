import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { type CommandResult, makeScratch, removeScratch } from "../../support/commands.ts";
import { folderState } from "../../support/producer-record.ts";
import { fixtureRecords, publishedFixture, type StageSixFixture, stageSix, stageSixFixture, startedFixture }
  from "../../support/stage-6-run.ts";
import { copyToolCheckout } from "../../support/tool-checkout.ts";

// The refusals of the Stage 6 actions, with their messages. Each case prepares a
// new copy of the producer fixture in one state, changes it, runs one action and
// expects a refusal that changes no file of the run. The checks of the settings
// and the arguments run when the helper loads, before its action: such a refusal
// ends the helper with an uncaught error and its stack trace.
type Json = Record<string, unknown>;
type RunState = "after Stage 5" | "started" | "published";
interface Action { args: string[]; settings?: Record<string, string>; tools?: string }
interface RefusalCase {
  name: string;
  state: RunState;
  // Changes the run or the readiness packet and gives the action to run.
  arrange(run: StageSixFixture, scratch: string): Action;
  // The message, or the message of the uncaught error of a check at load time.
  message: string | ((run: StageSixFixture) => string);
  uncaught?: boolean;
}

const id = "s6-refusal";
const usage = "Use preflight REVIEW_DIR, start REVIEW_DIR, check, finish, or verify.";
const lockPath = (run: StageSixFixture): string => join(run.work, ".stage-6-publish.lock");
const preflight = (run: StageSixFixture): Action => ({ args: ["preflight", run.review] });

function changeYaml(path: string, change: (record: Json) => void): void {
  const record = parse(readFileSync(path, "utf8")) as Json;
  change(record);
  writeFileSync(path, stringify(record));
}
const changeRunYaml = (run: StageSixFixture, change: (manifest: Json) => void): void => changeYaml(join(run.work, "run.yaml"), change);

// The refusal of a fixed discovery result whose baselineDigest is not the SHA-256 of the saved baseline file.
function digestMismatch(run: StageSixFixture): string {
  const discovery = parse(readFileSync(join(run.work, fixtureRecords.discoveryPath), "utf8")) as Json;
  const saved = createHash("sha256").update(readFileSync(join(run.work, fixtureRecords.baselinePath))).digest("hex");
  return `The discovery result names the baseline digest ${String(discovery.baselineDigest)}, ` +
    `but the SHA-256 of the saved baseline file is ${saved}.`;
}

async function runIn(state: RunState): Promise<StageSixFixture> {
  if (state === "started") return startedFixture(id);
  if (state === "published") return publishedFixture(id);
  return stageSixFixture();
}

const loadCases: RefusalCase[] = [
  { name: "a relative readiness packet folder", state: "after Stage 5", uncaught: true, message: usage,
    arrange: () => ({ args: ["start", "review"] }) },
  { name: "an argument after check", state: "after Stage 5", uncaught: true, message: usage,
    arrange: () => ({ args: ["check", "extra"] }) },
  { name: "an attempt ID that does not start with s6-", state: "after Stage 5", uncaught: true,
    message: "Set CHOOM_STAGE6_ID to a new or prepared s6-... ID.",
    arrange: (run) => ({ ...preflight(run), settings: { CHOOM_STAGE6_ID: "attempt-1", CHOOM_STAGE6: join(run.work, "evidence/attempt-1") } }) },
  { name: "an attempt folder setting that names another folder", state: "after Stage 5", uncaught: true,
    message: "Set CHOOM_STAGE6 to the matching attempt directory.",
    arrange: (run) => ({ ...preflight(run), settings: { CHOOM_STAGE6: join(run.work, "evidence/s6-other") } }) },
  { name: "the Stage 6 helper of another tool checkout", state: "after Stage 5", uncaught: true,
    message: "Use the Stage 6 helper in the trusted checkout.",
    arrange: (run, scratch) => ({ ...preflight(run), tools: copyToolCheckout(scratch) }) },
];

const startCases: RefusalCase[] = [
  { name: "an attempt folder that exists", state: "after Stage 5", message: "Start with a fresh attempt ID.",
    arrange: (run) => { mkdirSync(join(run.work, "evidence", id)); return { args: ["start", run.review] }; } },
  { name: "a readiness packet folder in the run folder", state: "after Stage 5",
    message: "Keep the readiness packet outside the saved run.",
    arrange: (run) => { mkdirSync(join(run.work, "review")); return { args: ["start", join(run.work, "review")] }; } },
  { name: "a readiness packet with another file", state: "after Stage 5", message: "Unexpected readiness packet file set.",
    arrange: (run) => { writeFileSync(join(run.review, "notes.md"), "# Notes\n"); return preflight(run); } },
  { name: "a run whose baseline recovery is complete", state: "after Stage 5",
    message: "Expected finalized Stage 5 and pending baseline recovery.",
    arrange: (run) => {
      changeRunYaml(run, (manifest) => { (manifest.progress as Json).baselineRecovery = "complete"; });
      return preflight(run);
    } },
  { name: "a working discovery that differs from the Stage 5 proposal", state: "after Stage 5",
    message: "Working draft differs from the published Stage 5 proposal: discovery",
    arrange: (run) => { appendFileSync(join(run.work, "discovery.yaml"), "# edited\n"); return preflight(run); } },
  { name: "a changed registered artifact", state: "after Stage 5", message: "Registered artifact changed: launch-settings",
    arrange: (run) => { appendFileSync(join(run.work, "evidence/launch-settings.json"), "\n"); return preflight(run); } },
  { name: "a snapshot file with another size", state: "after Stage 5", message: "Indexed size changed: http.ts",
    arrange: (run) => { appendFileSync(join(run.work, "snapshot/http.ts"), "\n"); return preflight(run); } },
  { name: "a fixed baseline that exists", state: "after Stage 5",
    message: `Fixed record already exists: ${fixtureRecords.baselinePath}`,
    arrange: (run) => {
      mkdirSync(join(run.work, "baselines/fixture-baseline"), { recursive: true });
      writeFileSync(join(run.work, fixtureRecords.baselinePath), "formatVersion: 1\n");
      return preflight(run);
    } },
  { name: "a publication temporary file", state: "after Stage 5", message: "Publication temporary file already exists: run",
    arrange: (run) => { writeFileSync(join(run.work, ".stage-6-run.next.yaml"), ""); return preflight(run); } },
  { name: "a second start", state: "started", message: "Start with a fresh attempt ID.", arrange: (run) => ({ args: ["start", run.review] }) },
];

const preparedCases: RefusalCase[] = [
  { name: "a changed prepared file", state: "started", message: "Changed prepared artifact: validation.json",
    arrange: (run) => { appendFileSync(join(run.work, "evidence", id, "validation.json"), "\n"); return { args: ["check"] }; } },
  { name: "another file in the attempt", state: "started", message: "Unexpected attempt file set.",
    arrange: (run) => { writeFileSync(join(run.work, "evidence", id, "notes.md"), "# Notes\n"); return { args: ["check"] }; } },
  { name: "a changed working draft before finish", state: "started", message: "Working draft changed: run.yaml",
    arrange: (run) => { appendFileSync(join(run.work, "run.yaml"), "# edited\n"); return { args: ["finish"] }; } },
  { name: "verify before finish", state: "started", message: "Unexpected attempt file set.", arrange: () => ({ args: ["verify"] }) },
  { name: "a publication lock of another publication", state: "started",
    message: (run) => `Another publication owns the lock or cleanup is pending: ${lockPath(run)}`,
    arrange: (run) => { mkdirSync(lockPath(run)); return { args: ["finish"] }; } },
];

const verifyCases: RefusalCase[] = [
  { name: "a second finish", state: "published", message: "Unexpected attempt file set.", arrange: () => ({ args: ["finish"] }) },
  { name: "a publication lock that remains", state: "published", message: (run) => `Publication lock remains. Check ${lockPath(run)}`,
    arrange: (run) => { mkdirSync(lockPath(run)); return { args: ["verify"] }; } },
  { name: "a publication temporary file that remains", state: "published", message: "Publication temporary file remains: discovery",
    arrange: (run) => { writeFileSync(join(run.work, ".stage-6-discovery.next.yaml"), ""); return { args: ["verify"] }; } },
  { name: "a changed working discovery", state: "published", message: "Working draft changed: discovery.yaml",
    arrange: (run) => { appendFileSync(join(run.work, "discovery.yaml"), "# edited\n"); return { args: ["verify"] }; } },
  { name: "a changed fixed discovery", state: "published", message: "Fixed records do not match the prepared result.",
    arrange: (run) => { appendFileSync(join(run.work, fixtureRecords.discoveryPath), "# edited\n"); return { args: ["verify"] }; } },
  // The fixed discovery result names the SHA-256 of the fixed baseline file, so a changed baseline file breaks that binding.
  { name: "a changed fixed baseline", state: "published", message: digestMismatch,
    arrange: (run) => { appendFileSync(join(run.work, fixtureRecords.baselinePath), "# edited\n"); return { args: ["verify"] }; } },
  { name: "a fixed discovery result with another baseline digest", state: "published", message: digestMismatch,
    arrange: (run) => {
      changeYaml(join(run.work, fixtureRecords.discoveryPath), (discovery) => { discovery.baselineDigest = "0123456789abcdef".repeat(4); });
      return { args: ["verify"] };
    } },
  { name: "a fixed discovery result of formatVersion 1, in the form of an older Stage 6", state: "published",
    message: "Expected a complete fixed discovery result of formatVersion 2 with baselineRef and baselineDigest.",
    arrange: (run) => {
      changeYaml(join(run.work, fixtureRecords.discoveryPath), (discovery) => {
        discovery.formatVersion = 1;
        delete discovery.baselineDigest;
      });
      return { args: ["verify"] };
    } },
  { name: "a finish receipt with another status", state: "published", message: "Invalid Stage 6 publication receipt.",
    arrange: (run) => {
      const path = join(run.work, "evidence", id, "operator-finish.json");
      writeFileSync(path, JSON.stringify({ ...(JSON.parse(readFileSync(path, "utf8")) as Json), status: "failed" }, null, 2) + "\n");
      return { args: ["verify"] };
    } },
];

function expectRefusal(result: CommandResult, message: string, uncaught: boolean): void {
  expect({ status: result.status, stdout: result.stdout }).toEqual({ status: 1, stdout: "" });
  if (!uncaught) expect(result.stderr).toBe(message + "\n");
  else {
    expect(result.stderr).toStartWith("file://");
    expect(result.stderr).toContain(`\nError: ${message}\n    at `);
  }
}

describe("Stage 6 refusals", () => {
  test.each([...loadCases, ...startCases, ...preparedCases, ...verifyCases])("$state: refuses $name", async (refusal) => {
    const scratch = makeScratch();
    const run = await runIn(refusal.state);
    try {
      const action = refusal.arrange(run, scratch);
      const before = folderState(run.work);
      const result = stageSix(run.work, id, action.args, action.settings, action.tools);
      expectRefusal(result, typeof refusal.message === "string" ? refusal.message : refusal.message(run), refusal.uncaught === true);
      expect(folderState(run.work)).toEqual(before);
    } finally {
      rmSync(run.root, { recursive: true, force: true });
      removeScratch(scratch);
    }
  }, 60_000);
});
