import { describe, expect, test } from "bun:test";
import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { type ExtraFile, type FixtureBaseline, inspectStageFour, publishStageFour, stageFourBaselineId, stageFourPublication,
  type StageFourPublication } from "../../fixtures/stage-4-publication/fixture.ts";
import { toolsRoot } from "../../support/commands.ts";
import { folderState } from "../../support/producer-record.ts";

// The Stage 4/5 publisher runs as an operator runs it, on a run after Stage 3
// with a complete Stage 4 attempt and a reviewed packet in a separate folder.
function withPublication(use: (fixture: StageFourPublication) => void, change?: (baseline: FixtureBaseline) => void,
  extraFiles: ExtraFile[] = []): void {
  const fixture = stageFourPublication(change, extraFiles);
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

// The shared record checks refuse a question or gap subject that names nothing. So a
// Stage 4 draft that renames a component that a question names is refused while the
// reviewer can still keep the old component ID.
describe("the Stage 4/5 publisher with a question about a component", () => {
  const question = { id: "s4-check-question-001", subjectRefs: ["http.purpose"], text: "Does http serve every order route?",
    evidenceRefs: ["launch-settings"] };
  const asked = (records: Record<string, Record<string, unknown>>): void => {
    for (const name of ["discovery.proposed.yaml", "entry-analysis.yaml"]) Object.assign(records[name] ?? {}, { questions: [question] });
  };
  function withQuestion(change: (baseline: FixtureBaseline) => void, use: (fixture: StageFourPublication) => void): void {
    const fixture = stageFourPublication(change, [], toolsRoot, asked);
    try {
      use(fixture);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }

  test("accepts a question about a component of the draft", () => {
    withQuestion(() => {}, (fixture) => {
      expect(result(publishStageFour(fixture, "check"))).toMatchObject({ status: "stage4-review-verified", questions: 1 });
    });
  }, 60_000);

  test("refuses a question about a component that the draft renamed, and writes nothing", () => {
    withQuestion((baseline) => {
      const http = baseline.components.find((component) => component.id === "http");
      if (http) http.id = "web";
    }, (fixture) => {
      refusedInCheck(fixture, "Question s4-check-question-001 names the subject http.purpose, which is not a file or folder of " +
        "the snapshot, the snapshot ID, a question or gap, an entry candidate or a baseline item.");
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

// A new entry candidate of the Stage 4 entry analysis whose file is JavaScript or
// TypeScript must be a root of the saved graph; a new candidate of another file need not.
describe("the Stage 4/5 publisher with new entry candidates", () => {
  const guide: ExtraFile = { path: "docs/guide.md", text: "# Guide\n" };
  const added = (id: string, path: string) => ({ id, expression: id, path, workspace: ".", roles: ["application"],
    origin: "script", evidenceRefs: ["launch-settings#/cli"] });
  function withAdded(candidates: unknown[], use: (fixture: StageFourPublication) => void): void {
    const fixture = stageFourPublication(undefined, [guide], toolsRoot, (records) => {
      const entry = records["entry-analysis.yaml"] as { candidates: unknown[] };
      entry.candidates = [...entry.candidates, ...candidates];
    });
    try {
      use(fixture);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }

  test("accepts a new entry of a root file and a new entry of a file that is not JavaScript or TypeScript", () => {
    withAdded([added("cli-again", "cli.ts"), added("guide-entry", guide.path)], (fixture) => {
      expect(result(publishStageFour(fixture, "check"))).toMatchObject({ status: "stage4-review-verified" });
    });
  }, 60_000);

  test("refuses a new JavaScript or TypeScript entry outside the saved roots, and writes nothing", () => {
    withAdded([added("http-entry", "http.ts")], (fixture) => {
      refusedInCheck(fixture, "New JavaScript/TypeScript entry is outside the saved root set: http-entry. " +
        "Revisit entry and graph analysis.");
    });
  }, 60_000);
});

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
    }, "A failed request has partial output. Preserve it and use a fresh attempt: excerpt-001"],
  ])("refuses %s in check, and writes nothing", (_name, change, message) => {
    withPublication((fixture) => {
      change(fixture);
      refusedInCheck(fixture, message);
    });
  }, 60_000);
});

// A file that calls start of cli.ts, so that the references to start have an entry to cite.
const main: ExtraFile = { path: "main.ts", text: "import { start } from './cli';\n\nstart();\n" };
const citeReference = (pointer: string) => (baseline: FixtureBaseline): void => {
  baseline.components[0]?.purpose.evidenceRefs.push(`s4-check-file@references-001.json#${pointer}`);
};

describe("the Stage 4/5 publisher with Stage 4 references requests", () => {
  test("accepts a completed references request and a failed one, and resolves a citation of a reference", () => {
    withPublication((fixture) => {
      requested(fixture, ["references", "cli.ts", "start"], 0);
      requested(fixture, ["references", "missing.ts", "start"], 1);
      expect(result(publishStageFour(fixture, "check"))).toMatchObject({ status: "stage4-review-verified" });
      expect(result(publishStageFour(fixture, "finish"))).toMatchObject({ status: "stage4-published" });
      const run = parse(readFileSync(join(fixture.work, "run.yaml"), "utf8")) as { artifacts: Record<string, { path: string }> };
      expect(run.artifacts["s4-check-file@references-001.json"]).toMatchObject({ path: "evidence/s4-check/references-001.json" });
      expect(result(publishStageFour(fixture, "verify"))).toMatchObject({ status: "stage4-publication-verified" });
    }, citeReference("/references/0"), [main]);
  }, 60_000);

  test.each([
    ["a changed references record", (fixture: StageFourPublication) => {
      requested(fixture, ["references", "cli.ts", "start"], 0);
      appendFileSync(join(fixture.attempt, "references-001.json"), "\n");
    }, "Collection output changed: references-001.json"],
    ["a failed references request with an output", (fixture: StageFourPublication) => {
      requested(fixture, ["references", "missing.ts", "start"], 1);
      writeFileSync(join(fixture.attempt, "references-001.json"), "{}\n");
    }, "A failed request has partial output. Preserve it and use a fresh attempt: references-001"],
  ])("refuses %s in check, and writes nothing", (_name, change, message) => {
    withPublication((fixture) => {
      change(fixture);
      refusedInCheck(fixture, message);
    }, undefined, [main]);
  }, 60_000);

  test("refuses a citation of a reference that the record does not hold", () => {
    withPublication((fixture) => {
      requested(fixture, ["references", "cli.ts", "start"], 0);
      refusedInCheck(fixture, "Unresolved evidence: s4-check-file@references-001.json#/references/9");
    }, citeReference("/references/9"), [main]);
  }, 60_000);
});

// The Stage 4 entry analysis names the behavior entry candidates that collect saved.
describe("the Stage 4/5 publisher with the behavior entry candidates of collect", () => {
  const route: ExtraFile = { path: "routes.ts", text: "import express from 'express';\nimport { start } from './cli';\n\n" +
    "express().get('/start', start);\n" };

  test("checks a candidate and its handler against the saved snapshot files, and publishes", () => {
    withPublication((fixture) => {
      const record = JSON.parse(readFileSync(join(fixture.attempt, "behavior-entry-candidates.json"), "utf8")) as
        { candidates: { handler: unknown }[] };
      expect(record.candidates.map(({ handler }) => handler)).toEqual([{ path: "cli.ts",
        range: [{ line: 1, column: 1 }, { line: 1, column: 27 }] }]);
      expect(result(publishStageFour(fixture, "check"))).toMatchObject({ status: "stage4-review-verified" });
      expect(result(publishStageFour(fixture, "finish"))).toMatchObject({ status: "stage4-published" });
    }, undefined, [route]);
  }, 60_000);

  // The bin field names cli.ts, a file of the snapshot, as the file of a command.
  const toolPackage: ExtraFile = { path: "package.json", text: "{\n  \"name\": \"choom-tools\",\n  \"bin\": { \"choom\": \"./cli.ts\" }\n}\n" };

  test("checks a bin candidate and the file that its command runs, with the evidence, and publishes", () => {
    withPublication((fixture) => {
      const record = JSON.parse(readFileSync(join(fixture.attempt, "behavior-entry-candidates.json"), "utf8")) as
        { candidates: { name: unknown; handler: unknown }[] };
      expect(record.candidates.map(({ name, handler }) => ({ name, handler }))).toEqual([{ name: "choom", handler: { path: "cli.ts",
        range: [{ line: 1, column: 1 }, { line: 2, column: 1 }], evidence: { kind: "snapshot-file", binFile: "cli.ts" } } }]);
      expect(result(publishStageFour(fixture, "check"))).toMatchObject({ status: "stage4-review-verified" });
    }, undefined, [toolPackage]);
  }, 60_000);

  test("refuses an entry analysis that does not name the candidates, and a candidates record that changed after collect", () => {
    const unnamed = stageFourPublication(undefined, [], toolsRoot, (records) => {
      delete records["entry-analysis.yaml"]?.behaviorEntryCandidatesRef;
    });
    try {
      refusedInCheck(unnamed, "The entry analysis must name the behavior entry candidates of Stage 4 collect: " +
        "s4-check-file@behavior-entry-candidates.json.");
    } finally {
      rmSync(unnamed.root, { recursive: true, force: true });
    }
    withPublication((fixture) => {
      appendFileSync(join(fixture.attempt, "behavior-entry-candidates.json"), "\n");
      refusedInCheck(fixture, "Collection output changed: behavior-entry-candidates.json");
    });
  }, 60_000);
});

// The Stage 4 resource observations name the resource access candidates that collect saved.
describe("the Stage 4/5 publisher with the resource access candidates of collect", () => {
  const orders: ExtraFile = { path: "orders.ts", text: "import knex from 'knex';\n\nknex({ client: 'pg' })('orders').insert(row);\n" };

  test("checks the candidates against the saved snapshot files, and publishes", () => {
    withPublication((fixture) => {
      const record = JSON.parse(readFileSync(join(fixture.attempt, "resource-access-candidates.json"), "utf8")) as
        { candidates: { ruleId: unknown; name: unknown }[] };
      expect(record.candidates.map(({ ruleId, name }) => ({ ruleId, name }))).toEqual([{ ruleId: "knex-insert", name: "orders" }]);
      expect(result(publishStageFour(fixture, "check"))).toMatchObject({ status: "stage4-review-verified" });
      expect(result(publishStageFour(fixture, "finish"))).toMatchObject({ status: "stage4-published" });
    }, undefined, [orders]);
  }, 60_000);

  test("refuses resource observations that do not name the candidates, and a candidates record that changed after collect", () => {
    const unnamed = stageFourPublication(undefined, [], toolsRoot, (records) => {
      delete records["resource-access.json"]?.resourceAccessCandidatesRef;
    });
    try {
      refusedInCheck(unnamed, "The resource observations must name the resource access candidates of Stage 4 collect: " +
        "s4-check-file@resource-access-candidates.json.");
    } finally {
      rmSync(unnamed.root, { recursive: true, force: true });
    }
    withPublication((fixture) => {
      appendFileSync(join(fixture.attempt, "resource-access-candidates.json"), "\n");
      refusedInCheck(fixture, "Collection output changed: resource-access-candidates.json");
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
