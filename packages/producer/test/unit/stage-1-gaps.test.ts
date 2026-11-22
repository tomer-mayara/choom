import { describe, expect, test } from "bun:test";
import { stageOneGaps } from "../../src/stage-1-gaps.ts";

describe("the discovery gaps of a Stage 1 tool record", () => {
  test("give each gap a stable ID from the record name and its position, and cite the gap in the record", () => {
    const gaps = [{ kind: "no-project-settings", subjectRefs: ["snapshot-check"], reason: "No project settings were found." },
      { kind: "missing-input", subjectRefs: ["tsconfig.base.json"], reason: "The base settings are not in the snapshot." }];
    expect(stageOneGaps.fromRecord({ name: "settings", artifactRef: "settings-001", gaps })).toEqual([
      { id: "s1-settings-gap-001", kind: "no-project-settings", subjectRefs: ["snapshot-check"],
        reason: "No project settings were found.", evidenceRefs: ["settings-001#/gaps/0"] },
      { id: "s1-settings-gap-002", kind: "missing-input", subjectRefs: ["tsconfig.base.json"],
        reason: "The base settings are not in the snapshot.", evidenceRefs: ["settings-001#/gaps/1"] },
    ]);
  });

  test("are none for a record without gaps", () => {
    expect(stageOneGaps.fromRecord({ name: "settings", artifactRef: "settings-001", gaps: [] })).toEqual([]);
  });

  test("are refused for a gap without a kind, a subject and a reason", () => {
    const gaps = [{ kind: "no-project-settings", subjectRefs: [], reason: "No project settings were found." }];
    expect(() => stageOneGaps.fromRecord({ name: "settings", artifactRef: "settings-001", gaps }))
      .toThrow(new Error("Invalid gap in the tool record: settings-001#/gaps/0"));
  });
});

