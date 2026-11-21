import { describe, expect, test } from "bun:test";
import { SavedAttemptFiles } from "../../src/saved-attempt-files.ts";

// A publisher registers every file of the attempt folder. The attempt files are the
// phase receipts, the outputs and logs that the receipts name, and the files that the
// stage names itself, such as the review packet and the command log. The publisher
// refuses any other file and names it.
const advice = "Do not write into the attempt; use a fresh attempt.";
const refusal = (names: string): Error => new Error(`Unexpected attempt file that no producer action saved: ${names}. ${advice}`);

// An attempt with a completed collect phase, a failed excerpt request, the review packet and the command log.
function savedFiles(): SavedAttemptFiles {
  return new SavedAttemptFiles()
    .addReceipt("operator-collect.json", ["source-excerpts.json", "review-prompt.md", "operator-collect.started.json",
      "operator-collect.stdout.txt", "operator-collect.stderr.txt"])
    // A failed request saved no output, so its receipt names only its logs.
    .addReceipt("operator-excerpt-001.json", ["operator-excerpt-001.started.json"])
    .add(["entry-analysis.yaml", "llm/analysis-response.md", "commands.md"]);
}

const attemptFiles = ["commands.md", "entry-analysis.yaml", "llm/analysis-response.md", "operator-collect.json",
  "operator-collect.started.json", "operator-collect.stderr.txt", "operator-collect.stdout.txt", "operator-excerpt-001.json",
  "operator-excerpt-001.started.json", "review-prompt.md", "source-excerpts.json"];

describe("SavedAttemptFiles", () => {
  test("accepts the phase receipts, the files that they name, and the files that the stage names", () => {
    expect(() => savedFiles().refuseOthers(attemptFiles)).not.toThrow();
  });

  test("accepts an attempt without a file that a receipt names; the receipt checks find a missing output", () => {
    expect(() => savedFiles().refuseOthers(attemptFiles.filter((name) => name !== "review-prompt.md"))).not.toThrow();
  });

  test("refuses a file that no receipt names and the stage does not name, and names it", () => {
    expect(() => savedFiles().refuseOthers([...attemptFiles, "notes.md"])).toThrow(refusal("notes.md"));
  });

  test("names each such file in order, also a file in a folder and a receipt that no phase saved", () => {
    expect(() => savedFiles().refuseOthers(["operator-notes.json", ...attemptFiles, "llm/notes.md", "a.txt"]))
      .toThrow(refusal("a.txt, llm/notes.md, operator-notes.json"));
  });
});
