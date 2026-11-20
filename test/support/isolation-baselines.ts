import { createHash } from "node:crypto";
import { boundaryBytes, type BoundaryExample } from "./boundary-baseline.ts";
import { decodeBaselineYaml } from "../../src/lib/baseline-yaml.ts";
import type { BaselineV6, IsolationInput } from "@choom/baseline-model/contracts";
import { stringify } from "yaml";

/** Return the named record of the serialized comparison fixture. */
export function fixtureItem<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing comparison fixture record.");
  return value;
}

export function comparisonInput(name: BoundaryExample, edit?: (baseline: BaselineV6) => void): IsolationInput {
  let text = boundaryBytes(name);
  const decoded = decodeBaselineYaml(text);
  if (decoded.status !== "success" || decoded.baseline.formatVersion !== 6) throw new Error("Expected a readable v6 fixture.");
  const baseline = decoded.baseline;
  if (edit) {
    edit(baseline);
    text = stringify(baseline);
  }
  return { baseline, sha256: createHash("sha256").update(text).digest("hex") };
}

/** The same implementation can be reached through a published path or a private route. */
export function routeInput(name: "before" | "after", access: string, policy: string): IsolationInput {
  return comparisonInput(name, ({ boundaryReview: review }) => {
    const rule = fixtureItem(review.rules[0]);
    const kind = access.startsWith("deep import") ? "import" : "call";
    Object.assign(rule, { kind: kind === "import" ? "path" : "visibility", accessKinds: [kind],
      settings: kind === "import" ? { publicPath: "@project/config" } : { ownerOnly: true } });
    const check = fixtureItem(review.checks[0]);
    check.coverage.accessKinds = [kind];
    if (name === "after") {
      review.accesses = review.accesses.filter((site) => !site.id.startsWith("history-loader-") || site.kind === kind);
      const site = fixtureItem(review.accesses.find((item) => item.id.startsWith("history-loader-")));
      if (kind === "call") {
        site.member = "privateHelper"; delete site.operationId;
      }
      check.accessIds = [site.id];
    }
    if (policy === "unknown policy") { review.rules = []; review.checks = []; }
  });
}

export function replacementInput(partial = false): IsolationInput {
  const file = routeInput("after", "deep import of a public operation", "an active public-path rule");
  if (file.baseline.formatVersion !== 6) throw new Error("Expected a boundary review.");
  const review = file.baseline.boundaryReview;
  fixtureItem(review.accesses.find((site) => site.id === "history-loader-import")).writtenPath = "@project/config";
  fixtureItem(review.checks[0]).result = "allowed";
  if (partial) { fixtureItem(review.checks[0]).coverage.status = "partial"; fixtureItem(review.checks[0]).coverage.limitations = ["One root was omitted."]; }
  file.sha256 = createHash("sha256").update(stringify(file.baseline)).digest("hex");
  return file;
}

export function movedSiteInput(beforeDigest: string): IsolationInput {
  return comparisonInput("after", ({ boundaryReview: review }) => {
    review.identity.referenceDigest = beforeDigest;
    const source = fixtureItem(review.units.find((unit) => unit.id === "history"));
    review.matches.push({ referenceDigest: beforeDigest, oldPath: source.path, unitId: source.id, evidenceRefs: ["declare-history"] });
    source.path = "src/runtime/history.ts"; delete source.stableId;
    for (const note of review.sourceNotes) if (note.location.path === "src/history.ts") {
      note.location.path = source.path; note.location.lines = note.location.lines.map((line) => line + 10);
    }
    const site = fixtureItem(review.accesses.find((access) => access.id === "history-loader-import"));
    review.accesses = review.accesses.filter((access) => access.id !== "history-loader-call");
    const additional = { ...site, id: "new-site", callerRef: "new-site-note", evidenceRefs: ["new-site-note"] };
    review.sourceNotes.push({ ...fixtureItem(review.sourceNotes.find((note) => note.evidenceRef === site.callerRef)),
      evidenceRef: "new-site-note", location: { ...fixtureItem(review.sourceNotes.find((note) => note.evidenceRef === site.callerRef)).location, lines: [20, 20] } });
    review.accesses.push(additional);
    review.checks.push({ ...fixtureItem(review.checks[0]), id: "second-check", accessIds: [additional.id] });
  });
}

export function exceptionInput(): IsolationInput {
  return comparisonInput("after", ({ boundaryReview: review }) => {
    const rule = fixtureItem(review.rules[0]);
    review.identity.referenceDigest = "a".repeat(64);
    review.rules.push({ ...rule, id: "approved-exception", name: "Reviewed loader exception", kind: "exception",
      authority: "accepted", overridesRuleId: rule.id, statementRef: "config-api.allowedConsumers",
      acceptanceRef: "decision-one", referenceDigest: review.identity.referenceDigest });
    Object.assign(fixtureItem(review.checks[0]), { result: "allowed", exceptionId: "approved-exception" });
  });
}

export function historyTestInput(): IsolationInput {
  return comparisonInput("after", ({ boundaryReview: review }) => {
    fixtureItem(review.componentScopes.find((c) => c.componentId === "history")).roles = ["test"];
    fixtureItem(review.units.find((u) => u.id === "history")).roles = ["test"];
    fixtureItem(review.operations.find((o) => o.unitId === "history")).roles = ["test"];
    for (const site of review.accesses) if (site.callerUnitId === "history") site.callerRole = "test";
  });
}
