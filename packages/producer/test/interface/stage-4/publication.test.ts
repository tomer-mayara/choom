import { describe, expect, test } from "bun:test";
import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { type FixtureBaseline, inspectStageFour, publishStageFour, stageFourBaselineId, stageFourPublication,
  type StageFourPublication } from "../../fixtures/stage-4-publication/fixture.ts";
import { folderState } from "../../support/producer-record.ts";

// The Stage 4/5 publisher runs as an operator runs it, on a run after Stage 3
// with a complete Stage 4 attempt and a reviewed packet in a separate folder.
function withPublication(use: (fixture: StageFourPublication) => void, change?: (baseline: FixtureBaseline) => void): void {
  const fixture = stageFourPublication(change);
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
  // The source collection writes the review prompt that the operator gives to the LLM.
  test("the Stage 4 review prompt asks for the visible response only", () => {
    withPublication((fixture) => {
      const prompt = readFileSync(join(fixture.attempt, "review-prompt.md"), "utf8");
      expect(prompt).toContain("Save the complete visible LLM response and call metadata with hiddenReasoning: not-saved.");
      expect(prompt).toContain("Do not save hidden reasoning.");
    });
  }, 60_000);

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

  // Defect 1: before this check, Stage 4 published the draft and only Stage 6 refused the ID.
  test("refuses a component ID equal to the baseline ID in check and finish, and writes nothing", () => {
    withPublication((fixture) => {
      const before = folderState(fixture.work);
      for (const action of ["check", "finish"] as const) {
        const refused = publishStageFour(fixture, action);
        expect({ action, status: refused.status, stdout: refused.stdout, stderr: refused.stderr }).toEqual({ action, status: 1,
          stdout: "", stderr: `The ID ${stageFourBaselineId} is reserved for the baseline. Use a different model ID.\n` });
      }
      expect(folderState(fixture.work)).toEqual(before);
    }, (baseline) => {
      const http = baseline.components.find((component) => component.id === "http");
      if (http) http.id = baseline.id;
    });
  }, 60_000);
});

// The publisher checks the receipt of each numbered request of Stage 4 inspect after collect.
function requested(fixture: StageFourPublication, args: string[], status: number): void {
  expect({ args, status: inspectStageFour(fixture, args).status }).toEqual({ args, status });
}

function refusedInCheck(fixture: StageFourPublication, message: string): void {
  const before = folderState(fixture.work);
  const refused = publishStageFour(fixture, "check");
  expect({ status: refused.status, stdout: refused.stdout, stderr: refused.stderr }).toEqual({ status: 1, stdout: "", stderr: message + "\n" });
  expect(folderState(fixture.work)).toEqual(before);
}

describe("the Stage 4/5 publisher with Stage 4 excerpt requests", () => {
  test("accepts a completed excerpt request and a failed one", () => {
    withPublication((fixture) => {
      requested(fixture, ["excerpt", "cli.ts", "1", "1"], 0);
      requested(fixture, ["excerpt", "missing.ts", "1", "1"], 1);
      expect(result(publishStageFour(fixture, "check"))).toMatchObject({ status: "stage4-review-verified" });
    });
  }, 60_000);

  test.each([
    ["a changed excerpt", (fixture: StageFourPublication) => {
      requested(fixture, ["excerpt", "cli.ts", "1", "1"], 0);
      appendFileSync(join(fixture.attempt, "excerpt-001.json"), "\n");
    }, "Collection output changed: excerpt-001.json"],
    ["a failed excerpt request with an output", (fixture: StageFourPublication) => {
      requested(fixture, ["excerpt", "missing.ts", "1", "1"], 1);
      writeFileSync(join(fixture.attempt, "excerpt-001.json"), "{}\n");
    }, "A failed excerpt has partial output. Preserve it and use a fresh attempt: excerpt-001"],
  ])("refuses %s in check, and writes nothing", (_name, change, message) => {
    withPublication((fixture) => {
      change(fixture);
      refusedInCheck(fixture, message);
    });
  }, 60_000);
});

// The publisher checks the LLM part of the packet before it validates the records.
interface PacketCase { name: string; file: string; change: (text: string) => string; message: string }

const packetCases: PacketCase[] = [
  { name: "the call record has no model", file: "llm/analysis-call.yaml",
    change: (text) => text.replace(/^model: .*\n/m, ""), message: "Record exposed LLM metadata; use unknown for unavailable values." },
  { name: "the response does not contain the five records", file: "llm/analysis-response.md", change: () => "No records.\n",
    message: "Save the complete prompt and response, including the exact five candidate records." },
  { name: "the call record does not say that hidden reasoning was not saved", file: "llm/analysis-call.yaml",
    change: (text) => text.replace(/^hiddenReasoning: .*\n/m, ""), message: "Record hiddenReasoning: not-saved in llm/analysis-call.yaml." },
  { name: "the response holds a reasoning block", file: "llm/analysis-response.md",
    change: (text) => "<thinking>\nThe CLI file starts the service.\n</thinking>\n" + text,
    message: "llm/analysis-response.md contains a hidden reasoning block. Save only the visible response." },
  { name: "the review scope names another attempt", file: "llm/review-scope.json",
    change: (text) => JSON.stringify({ ...(JSON.parse(text) as object), attemptId: "s4-other" }), message: "Invalid LLM review scope." },
  { name: "the review folder has another file", file: "notes.md", change: () => "A note.\n",
    message: "Expected exactly the nine review packet files from record-format.md." },
];

function changeReviewFile(fixture: StageFourPublication, name: string, change: (text: string) => string): void {
  const path = join(fixture.review, name);
  let text = "";
  try { text = readFileSync(path, "utf8"); } catch { text = ""; }
  writeFileSync(path, change(text));
}

describe("the Stage 4/5 publisher with an incomplete or repeated review", () => {
  test.each(packetCases)("refuses a packet in which $name in check and finish, and writes nothing", ({ file, change, message }) => {
    withPublication((fixture) => {
      changeReviewFile(fixture, file, change);
      const before = folderState(fixture.work);
      for (const action of ["check", "finish"] as const) {
        const refused = publishStageFour(fixture, action);
        expect({ action, status: refused.status, stdout: refused.stdout, stderr: refused.stderr })
          .toEqual({ action, status: 1, stdout: "", stderr: message + "\n" });
      }
      expect(folderState(fixture.work)).toEqual(before);
    });
  }, 60_000);

  test("refuses to publish an attempt again after it published", () => {
    withPublication((fixture) => {
      expect(publishStageFour(fixture, "finish").status).toBe(0);
      const before = folderState(fixture.work);
      const again = publishStageFour(fixture, "finish");
      // The publisher compares the drafts with the attempt checkpoints first.
      expect({ status: again.status, stdout: again.stdout, stderr: again.stderr })
        .toEqual({ status: 1, stdout: "", stderr: "Working draft changed: run.yaml\n" });
      expect(folderState(fixture.work)).toEqual(before);
    });
  }, 60_000);
});
