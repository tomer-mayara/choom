import { boundaryFixture } from "./boundary-baseline.ts";
import type { BaselineV6 } from "@choom/baseline-model/contracts";

export function excludedTargetBaseline(): BaselineV6 {
  const file = boundaryFixture();
  const review = file.boundaryReview;
  const access = review.accesses.find(({ id }) => id === "history-loader-import");
  const rule = review.rules[0];
  const check = review.checks[0];
  if (!access || !rule || !check) throw new Error("Missing reviewed history import");
  Object.assign(access, {
    writtenPath: "../test/adapter", targetUnitId: "adapter", operationId: "fixture", member: "inMemoryAdapter", targetRole: "test",
  });
  rule.name = "History must avoid the In-memory adapter";
  rule.settings.to = { reachable: true, path: "^test/adapter.ts$" };
  check.targetUnitId = "adapter";
  check.coverage.examinedUnitIds.push("adapter");
  return file;
}
