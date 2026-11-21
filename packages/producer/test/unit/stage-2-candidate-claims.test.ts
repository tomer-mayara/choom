import { expect, test } from "bun:test";
import { CandidateClaims } from "../../src/stage-2-candidate-claims.ts";

const ref = "s2-run-knip-runs";
const runs = [{ mode: "normal", status: "completed", stdout: "normal.stdout.txt" }, { mode: "production", status: "skipped" }];
const claim = (mode: string, index: number, outcome: string) => ({ mode, receiptRef: ref + "#/runs/" + index, outcome });
const claims = new CandidateClaims(ref, runs, () => ({ issues: [{ file: "app.ts" }] }));
const candidate = { id: "app", path: "app.ts", roles: ["unknown"], evidenceRefs: ["inventory-001"] };

test("use the exact selected mode, status and report for each candidate claim", () => {
  expect(() => claims.validate({ ...candidate, knipClaims: [claim("production", 1, "unknown")] })).not.toThrow();
  expect(() => claims.validate({ ...candidate, knipClaims: [claim("normal", 0, "reported")] })).not.toThrow();
  expect(() => claims.validate({ ...candidate, knipClaims: [claim("production", 1, "reported")] })).toThrow("completed");
  expect(() => claims.validate({ ...candidate, knipClaims: [claim("production", 0, "unknown")] })).toThrow("exact");
  expect(() => claims.validate({ ...candidate, path: "other.ts", knipClaims: [claim("normal", 0, "reported")] })).toThrow("candidate file");
  expect(() => claims.validate({ ...candidate, evidenceRefs: [ref], knipClaims: [] })).toThrow("exact mode");
});
