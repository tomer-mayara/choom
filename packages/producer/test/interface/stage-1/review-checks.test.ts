import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { withScratch } from "../../support/commands.ts";
import { type Excerpt, type ReviewPacket, reviewPacket, stageOne, stageOneRun, type StageOneRun,
  writeReview } from "../../support/stage-1-run.ts";
import { pathWithDoubles } from "../../support/tool-doubles.ts";

// Finish checks the complete review packet before it copies anything, and excerpt
// checks the requested range. Each refused command leaves the run unchanged.
interface ReviewCase { name: string; change: (packet: ReviewPacket) => void; message: string; inside?: boolean }

const listItem = (packet: ReviewPacket, key: string): Record<string, unknown> => {
  const [item] = packet.review[key] as Record<string, unknown>[];
  if (item === undefined) throw new Error("The packet has no " + key);
  return item;
};

const reviewCases: ReviewCase[] = [
  { name: "the review has an extra field", change: (packet) => { packet.review.extra = 1; },
    message: "Expected a complete Stage 1 review." },
  { name: "the call record has no model", change: (packet) => { delete packet.call.model; },
    message: "Record LLM provider, model, date and settings; use unknown for unavailable metadata." },
  { name: "the response does not contain the review", change: (packet) => { packet.response = "No review.\n"; },
    message: "Save the complete final review YAML in the LLM response." },
  { name: "a packet file is empty", change: (packet) => { packet.prompt = ""; }, message: "Empty review packet file." },
  { name: "a reviewed source has no exact excerpt", change: (packet) => { listItem(packet, "reviewedFiles").lines = [1, 4]; },
    message: "No exact supplied excerpt supports source record: s1-source-001" },
  { name: "a role cites unknown evidence", change: (packet) => { listItem(packet, "roles").evidenceRefs = ["missing"]; },
    message: "Unknown evidence reference: missing" },
  { name: "a JSON Pointer does not resolve",
    change: (packet) => { listItem(packet, "roles").evidenceRefs = ["inventory-001#/missing"]; },
    message: "Unresolved JSON Pointer: inventory-001#/missing" },
  { name: "a role has an unknown basis", change: (packet) => { listItem(packet, "roles").basis = "guessed"; },
    message: "Invalid role." },
  { name: "a question uses an artifact ID", change: (packet) => { listItem(packet, "questions").id = "inventory-001"; },
    message: "Invalid question or gap." },
  { name: "the scope omits required evidence",
    change: (packet) => { packet.scope.suppliedArtifactRefs = (packet.scope.suppliedArtifactRefs as string[])
      .filter((ref) => ref !== "settings-001"); },
    message: "Missing required supplied evidence: settings-001" },
  { name: "a role cites evidence that the scope does not list",
    change: (packet) => { listItem(packet, "roles").evidenceRefs = ["tools-001"]; },
    message: "Cited artifact was not declared supplied: tools-001" },
  { name: "the review folder is inside the run", change: () => undefined, inside: true,
    message: "Keep review inputs outside the saved run." },
];

function capturedRun(scratch: string): { run: StageOneRun; excerpt: Excerpt } {
  const run = stageOneRun(scratch, { PATH: pathWithDoubles(scratch) });
  for (const action of ["start", "capture", "settings"]) expect(stageOne(run, action).status).toBe(0);
  const excerpt = stageOne(run, "excerpt", "package.json", "1", "5", "Check the workspace patterns.");
  return { run, excerpt: JSON.parse(excerpt.stdout) as Excerpt };
}

const excerptCases = [
  { args: ["package.json", "1", "99", "Read more."], message: "Source range is outside the saved file." },
  { args: ["missing.ts", "1", "1", "Read it."], message: "Source is not in the saved inventory: missing.ts" },
  { args: ["package.json", "1", "2"], message: "Use excerpt PATH FIRST LAST REASON." },
  { args: ["../package.json", "1", "2", "Read it."], message: "Use a snapshot-relative source path." },
];

describe("Stage 1 review and excerpt checks", () => {
  test("refuses invalid excerpts and incomplete review packets, then saves a complete packet", () => {
    withScratch((scratch) => {
      const { run, excerpt } = capturedRun(scratch);
      for (const { args, message } of excerptCases) {
        const result = stageOne(run, "excerpt", ...args);
        expect({ args, status: result.status, stdout: result.stdout, stderr: result.stderr }).toEqual({ args, status: 1,
          stdout: "", stderr: message + "\n" });
      }
      expect(readdirSync(join(run.work, "evidence/excerpts"))).toEqual(["excerpt-001.json"]);
      const files = readdirSync(join(run.work, "evidence")).sort();
      reviewCases.forEach(({ name, change, message, inside }, index) => {
        const packet = reviewPacket(excerpt);
        change(packet);
        const folder = inside ? join(run.work, "review-inside") : join(scratch, `review-${index}`);
        const finish = stageOne(run, "finish", writeReview(run, packet, folder));
        expect({ name, status: finish.status, stderr: finish.stderr }).toEqual({ name, status: 1, stderr: message + "\n" });
      });
      expect(readdirSync(join(run.work, "evidence")).sort()).toEqual(files);
      expect(existsSync(join(run.work, "run.yaml"))).toBe(false);
      expect(stageOne(run, "finish", writeReview(run, reviewPacket(excerpt))).status).toBe(0);
    });
  }, 60_000);
});
