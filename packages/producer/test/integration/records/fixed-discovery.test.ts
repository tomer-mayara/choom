import { describe, expect, test } from "bun:test";
import { fixedDiscovery, type RecordInputs } from "../../../src/stage-6-records.ts";
import { digest, recordInputs } from "../../support/stage-6-records.ts";

// The fixed discovery result that Stage 6 saves (formatVersion 2), and its check by
// the shared record checks against the saved baseline file. The checks run the
// shared baseline rules of @choom/baseline-model, so this is an integration suite.
type Json = Record<string, unknown>;

// The bytes of the saved baseline file of the records. The in-memory records are JSON, which is also YAML.
const baselineFile = (inputs: RecordInputs): Buffer => Buffer.from(JSON.stringify(inputs.baseline));

describe("the fixed discovery result", () => {
  test("keeps every field of the working discovery and adds format version 2, the baseline ID and the SHA-256 of the file", () => {
    const inputs = recordInputs();
    const working = inputs.discovery as Json;
    const before = structuredClone(working);
    const file = baselineFile(inputs);
    const fixed = fixedDiscovery(working, "base-1", file);
    expect(fixed).toEqual({ ...before, formatVersion: 2, baselineRef: "base-1", baselineDigest: digest(file) });
    expect(Object.keys(fixed)).toEqual([...Object.keys(before), "baselineRef", "baselineDigest"]);
    expect(working).toEqual(before);
  });
});
