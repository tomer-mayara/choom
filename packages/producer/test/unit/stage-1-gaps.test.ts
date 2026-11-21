import { describe, expect, test } from "bun:test";
import { gitIdentityTool, isToolGap, settingsTool, toolGaps } from "../../src/stage-1-gaps.ts";

describe("the discovery gaps of a Stage 1 tool record", () => {
  test("give each gap a stable ID from the record name and its position, and cite the gap in the record", () => {
    const gaps = [{ kind: "no-project-settings", subjectRefs: ["snapshot-check"], reason: "No project settings were found." },
      { kind: "missing-input", subjectRefs: ["tsconfig.base.json"], reason: "The base settings are not in the snapshot." }];
    expect(toolGaps({ name: "settings", artifactRef: "settings-001", gaps })).toEqual([
      { id: "s1-settings-gap-001", kind: "no-project-settings", subjectRefs: ["snapshot-check"],
        reason: "No project settings were found.", evidenceRefs: ["settings-001#/gaps/0"] },
      { id: "s1-settings-gap-002", kind: "missing-input", subjectRefs: ["tsconfig.base.json"],
        reason: "The base settings are not in the snapshot.", evidenceRefs: ["settings-001#/gaps/1"] },
    ]);
  });

  test("are none for a record without gaps", () => {
    expect(toolGaps({ name: "settings", artifactRef: "settings-001", gaps: [] })).toEqual([]);
  });

  test("are refused for a gap without a kind, a subject and a reason", () => {
    const gaps = [{ kind: "no-project-settings", subjectRefs: [], reason: "No project settings were found." }];
    expect(() => toolGaps({ name: "settings", artifactRef: "settings-001", gaps }))
      .toThrow(new Error("Invalid gap in the tool record: settings-001#/gaps/0"));
  });
});

// The shared record checks of Stages 4 to 6 do not check the subjects of a gap that
// Stage 1 finish copied from a tool record. They know such a gap by its form.
describe("isToolGap", () => {
  const missing = { kind: "missing-input", subjectRefs: ["tsconfig.missing.json"], reason: "The base settings are missing." };
  const unavailable = { kind: "git-unavailable", subjectRefs: ["snapshot-check"], reason: "Git did not run." };

  test("knows each gap that toolGaps makes from the settings record and the Git identity record", () => {
    const gaps = [...toolGaps({ ...settingsTool, gaps: [missing, missing] }), ...toolGaps({ ...gitIdentityTool, gaps: [unavailable] })];
    expect(gaps.map((gap) => [gap.id, gap.evidenceRefs])).toEqual([
      ["s1-settings-gap-001", ["settings-001#/gaps/0"]], ["s1-settings-gap-002", ["settings-001#/gaps/1"]],
      ["s1-git-identity-gap-001", ["git-identity-001#/gaps/0"]]]);
    expect(gaps.map(isToolGap)).toEqual([true, true, true]);
  });

  test.each([
    ["a review gap", { id: "s1-gap-001", evidenceRefs: ["settings-001#/gaps/0"] }],
    ["a gap of a record that is not a Stage 1 tool record", { id: "s1-review-gap-001", evidenceRefs: ["review-001#/gaps/0"] }],
    ["a gap that cites another gap of the record", { id: "s1-settings-gap-001", evidenceRefs: ["settings-001#/gaps/1"] }],
    ["a gap that cites the gap of another tool record", { id: "s1-settings-gap-001", evidenceRefs: ["git-identity-001#/gaps/0"] }],
    ["a gap that cites the whole record", { id: "s1-settings-gap-001", evidenceRefs: ["settings-001"] }],
    ["a gap with a second evidence reference", { id: "s1-settings-gap-001",
      evidenceRefs: ["settings-001#/gaps/0", "inventory-001"] }],
    ["a gap whose number has another form", { id: "s1-settings-gap-0001", evidenceRefs: ["settings-001#/gaps/0"] }],
    ["a gap with the number 000", { id: "s1-settings-gap-000", evidenceRefs: ["settings-001#/gaps/-1"] }],
    ["a gap of a later stage", { id: "s2-check-gap-001", evidenceRefs: ["settings-001#/gaps/0"] }],
  ])("does not know %s", (_name, gap) => {
    expect(isToolGap(gap)).toBe(false);
  });
});
