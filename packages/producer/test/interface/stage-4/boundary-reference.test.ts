import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import type { BaselineV6 } from "@choom/baseline-model/contracts";
import { parse, stringify } from "yaml";
import { fixtureValue, rewriteProposal, stageFourBoundary } from "../../fixtures/boundary-publication/fixture.ts";
import { publishStageFour } from "../../fixtures/stage-4-publication/fixture.ts";

const decision = "accepted-collector-policy";
const refFile = new URL("../../../../../test/fixtures/baseline-viewer/published-boundary-before.yaml", import.meta.url);
const frozen = parse(readFileSync(refFile, "utf8")) as BaselineV6;
const previous = fixtureValue(frozen.interfaces.find((item) => item.id === "loader-interface"));
previous.allowedConsumers = { ...previous.allowedConsumers, status: "accepted", value: ["collector"], acceptanceRef: decision };

function inherit(current: BaselineV6, reference: string) {
  const review = current.boundaryReview;
  const item = fixtureValue(current.interfaces.find((item) => item.id === "loader-interface"));
  item.allowedConsumers = { ...previous.allowedConsumers };
  const digest = createHash("sha256").update(reference).digest("hex");
  review.rules.push({ id: "accepted-allowlist", name: "Collector loads configuration", kind: "allowlist", authority: "accepted",
    revision: decision, scope: "The loader interface", settings: { allowedConsumers: ["collector"] }, accessKinds: ["call"],
    evidenceRefs: fixtureValue(review.operations.find((op) => op.id === "loader")).evidenceRefs, statementRef: item.id + ".allowedConsumers",
    acceptanceRef: decision, referenceDigest: digest });
  const check = fixtureValue(review.checks[0]);
  review.checks.push({ ...check, id: "accepted-loader-check", ruleId: "accepted-allowlist", sourceUnitId: "collector", result: "allowed",
    accessIds: ["collector-loader-call"], coverage: { ...check.coverage, roots: ["src/collector.ts"], examinedUnitIds: ["collector", "loader"],
      accessKinds: ["call"] } });
}

test("a frozen decision applies to the matched units and preserved allowlist only", () => {
  const reference = stringify(frozen, { aliasDuplicateObjects: false });
  const fixture = stageFourBoundary("direct", { reference });
  try {
    rewriteProposal(fixture.review, (baseline) => inherit(baseline, reference));
    const valid = publishStageFour(fixture, "check");
    expect(valid.stderr).toBe("");
    expect(valid.status).toBe(0);
    rewriteProposal(fixture.review, (baseline) => {
      fixtureValue(baseline.interfaces.find((item) => item.id === "loader-interface")).allowedConsumers.value = ["history"];
      fixtureValue(baseline.boundaryReview.rules.at(-1)).settings.allowedConsumers = ["history"];
    });
    const invalid = publishStageFour(fixture, "check");
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toMatch(/frozen|inherited|accepted/i);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
}, 60_000);
