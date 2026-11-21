import { expect, test } from "bun:test";
import { selectProjectKey } from "../../src/stage-1-project.ts";

test("an explicit or frozen key identifies the project across runs", () => {
  expect(selectProjectKey("TraceRelic", null)).toEqual("TraceRelic");
  expect(selectProjectKey(undefined, "TraceRelic")).toEqual("TraceRelic");
  expect(selectProjectKey("TraceRelic", "TraceRelic")).toEqual("TraceRelic");
  expect(() => selectProjectKey("Other", "TraceRelic")).toThrow("conflicts");
  expect(() => selectProjectKey(" ", null)).toThrow("nonempty");
  expect(selectProjectKey(undefined, null)).not.toEqual(selectProjectKey(undefined, null));
});

test("explicit ASCII and multibyte keys use the v6 byte limit", () => {
  for (const key of ["x".repeat(4096), "🙂".repeat(1024)]) {
    expect(selectProjectKey(key, null)).toBe(key);
    expect(() => selectProjectKey(key + "x", null)).toThrow("4096 UTF-8 bytes");
  }
});
