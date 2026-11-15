import { describe, expect, test } from "bun:test";
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readCompletedRun } from "../../src/completed-run.ts";
import { checkDecider, type ModelCall, runModelCalls } from "../../src/decider-check.ts";
import { withScratch } from "../support/commands.ts";
import { llmCallRecord, type RunFile, smallRunBaselinePath, writeSmallCompletedRun } from "../support/completed-run.ts";

// The run check of a decision file: the decider is not a model in the LLM call
// records of the run. The model names are fictional.
const reviewCall = "evidence/s6-001/llm/analysis-call.yaml";
const calls: ModelCall[] = [{ path: "evidence/llm-call.yaml", model: "Example Model A" },
  { path: reviewCall, model: "Fictional Model 7" }];

function smallRun(scratch: string, files: RunFile[]): string {
  const work = join(scratch, "run");
  writeSmallCompletedRun(work, [{ path: smallRunBaselinePath, text: "formatVersion: 1\n" }, ...files]);
  return work;
}

describe("the LLM call records of a run", () => {
  test("are the registered files under evidence whose names end with -call.yaml", () => {
    withScratch((scratch) => {
      const work = smallRun(scratch, [
        { path: "evidence/llm-call.yaml", text: llmCallRecord("Example Model A") },
        { path: "evidence/s2-001/llm/plan-call.yaml", text: llmCallRecord("Example Model B") },
        { path: "evidence/s2-001/llm/analysis-call.yaml", text: llmCallRecord("unknown") },
        { path: reviewCall, text: llmCallRecord("Fictional Model 7") },
        // A failed attempt that run.yaml does not register, a Git call record and a snapshot file.
        { path: "evidence/s4-002/llm/analysis-call.yaml", text: llmCallRecord("Example Model D"), registered: false },
        { path: "evidence/git/call-001.json", text: "{}\n" },
        { path: "snapshot/llm-call.yaml", text: llmCallRecord("Example Model E") },
      ]);
      expect(runModelCalls(readCompletedRun(work))).toEqual([
        { path: "evidence/llm-call.yaml", model: "Example Model A" },
        { path: "evidence/s2-001/llm/plan-call.yaml", model: "Example Model B" },
        { path: "evidence/s2-001/llm/analysis-call.yaml", model: "unknown" },
        { path: reviewCall, model: "Fictional Model 7" },
      ]);
    });
  });

  test.each([["no model value", "provider: fixture\nhiddenReasoning: not-saved\n"], ["a blank model value", "model: ' '\n"],
    ["a list", "- model: Example Model A\n"]])("are refused when one has %s", (_name, text) => {
    withScratch((scratch) => {
      const run = readCompletedRun(smallRun(scratch, [{ path: "evidence/llm-call.yaml", text }]));
      expect(() => runModelCalls(run)).toThrow(new Error("The LLM call record evidence/llm-call.yaml has no model value."));
    });
  });

  test("are refused when one is not YAML", () => {
    withScratch((scratch) => {
      const run = readCompletedRun(smallRun(scratch, [{ path: "evidence/llm-call.yaml", text: "model: [Example\n" }]));
      expect(() => runModelCalls(run)).toThrow(/^Cannot read the LLM call record evidence\/llm-call\.yaml: /);
    });
  });

  test("are refused when one changed after it was saved", () => {
    withScratch((scratch) => {
      const work = smallRun(scratch, [{ path: "evidence/llm-call.yaml", text: llmCallRecord("Example Model A") }]);
      const run = readCompletedRun(work);
      appendFileSync(join(work, "evidence/llm-call.yaml"), "settings: changed\n");
      expect(() => runModelCalls(run)).toThrow(/^The registered file evidence\/llm-call\.yaml changed after it was saved/);
    });
  });

  test("are read within a limit of 1 MiB each", () => {
    withScratch((scratch) => {
      const work = smallRun(scratch, [{ path: "evidence/llm-call.yaml", text: llmCallRecord("Example Model A") }]);
      writeFileSync(join(work, "evidence/llm-call.yaml"), "#".repeat(1024 * 1024 + 1));
      expect(() => runModelCalls(readCompletedRun(work))).toThrow(
        "The registered file evidence/llm-call.yaml is larger than the read limit of 1048576 bytes.");
    });
  });
});

describe("the decider check", () => {
  test.each(["Fictional Model 7", "fictional model 7", "  FICTIONAL MODEL 7\t"])(
    "refuses the decider %p, a model of the run after trimming and in any letter case", (name) => {
      expect(() => checkDecider(name, calls)).toThrow(new Error(`The decider ${JSON.stringify(name)} is the model ` +
        `"Fictional Model 7" of the LLM call record ${reviewCall}. A model cannot accept or correct statements. ` +
        "Name the person who made the decisions."));
    });

  test.each(["Ada Example", "Fictional Model 7 Reviewer", "Fictional  Model 7"])("accepts the decider %p", (name) => {
    expect(() => checkDecider(name, calls)).not.toThrow();
  });

  test("also compares a model value unknown, so a decider cannot be named unknown", () => {
    expect(() => checkDecider("Unknown", [{ path: reviewCall, model: "unknown" }])).toThrow(/^The decider "Unknown" is the model "unknown"/);
  });

  test("refuses a run without LLM call records, because it cannot make the check", () => {
    expect(() => checkDecider("Ada Example", [])).toThrow(new Error("The run registers no LLM call records, so the decider " +
      "cannot be compared with the models of the run. A run that Stage 6 completed has the call records of its stages."));
  });
});
