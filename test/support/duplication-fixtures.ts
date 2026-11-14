import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { DuplicationReport } from "../../src/domain/generated/contracts.ts";
import { decodeBaselineYaml } from "../../src/lib/baseline-yaml.ts";

export function duplicationFixture() {
  const bytes = readFileSync("test/fixtures/baseline-viewer/full.yaml");
  const outcome = decodeBaselineYaml(bytes.toString("utf8"));
  if (outcome.status !== "success") throw new Error("Invalid duplication baseline fixture.");
  const report = JSON.parse(readFileSync("test/fixtures/interface-duplication/review.yaml", "utf8")) as DuplicationReport;
  return { baseline: outcome.baseline, report, sha256: createHash("sha256").update(bytes).digest("hex") };
}
