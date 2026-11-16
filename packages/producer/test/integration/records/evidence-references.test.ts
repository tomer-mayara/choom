import { describe, expect, test } from "bun:test";
import { validateDiscoveryRecords } from "../../../src/stage-6-records.ts";
import { recordInputs, type Records, selected } from "../../support/stage-6-records.ts";

// The evidence references that the shared record checks of Stages 4, 5 and 6
// resolve, with the messages of these stages. The checks run the shared baseline
// rules of @choom/baseline-model, so this is an integration suite.
const citedByOverview = (...evidenceRefs: string[]) => (records: Records): void => {
  records.discovery.overview = { text: "Overview.", evidenceRefs };
};

const refusedReferences: [string, string, string][] = [
  ["an unknown record", "missing", "Unknown evidence: missing"],
  ["a JSON Pointer that is not a path", "launch#cli", "Invalid JSON Pointer: launch#cli"],
  ["a missing key", "launch#/missing", "Unresolved evidence: launch#/missing"],
  ["an escape other than ~0 and ~1", "launch#/cli~2", "Unresolved evidence: launch#/cli~2"],
  ["a list item with a leading zero", "graph#/contexts/00", "Unresolved evidence: graph#/contexts/00"],
  ["the length of a list", "graph#/contexts/length", "Unresolved evidence: graph#/contexts/length"],
];

describe("the evidence references of the shared record checks", () => {
  test("accept a saved record, a source record, a whole JSON record and JSON Pointers into JSON and YAML records", () => {
    const inputs = recordInputs(citedByOverview("launch", "orders-handler", "launch#", "launch#/cli",
      "graph#/contexts/0/roots/0", `${selected.entryAnalysisRef}#/gaps/0`, "orders-handler#/lines/0"));
    expect(validateDiscoveryRecords(inputs)).toMatchObject({ components: 2 });
  });

  test.each(refusedReferences)("refuse %s", (_name, ref, message) => {
    expect(() => validateDiscoveryRecords(recordInputs(citedByOverview(ref)))).toThrow(new Error(message));
  });
});
