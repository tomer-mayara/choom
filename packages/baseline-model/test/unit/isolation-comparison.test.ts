import { expect, test } from "bun:test";
import type { BaselineBoundaryReview } from "../../src/generated/contracts.ts";
import { compareIsolation } from "../../src/isolation-comparison.ts";
import { fixtureItem, comparisonInput, exceptionInput, historyTestInput, movedSiteInput, replacementInput, routeInput } from "../../../../test/support/isolation-baselines.ts";

test("a complete Before search dates a forbidden path to its actual target", () => {
  const result = compareIsolation(comparisonInput("before"), comparisonInput("after"));
  expect(result.findings.filter(({ change }) => change === "New violation")).toEqual([expect.objectContaining({
    before: expect.objectContaining({ coverageIds: ["history-loader-rule"] }),
    after: expect.objectContaining({ callerUnitId: "history", targetUnitId: "loader",
      accessIds: ["history-loader-call", "history-loader-import"] }),
  })]);
});

test("a shorter path to the same unit remains one existing violation", () => {
  const before = comparisonInput("after", ({ boundaryReview: r }) => {
    const edge = fixtureItem(r.accesses.find((site) => site.id === "history-loader-import"));
    r.accesses = r.accesses.filter((site) => site.kind !== "call" || site.callerUnitId !== "history");
    r.accesses.push({ ...edge, id: "helper-loader", callerUnitId: "shape" });
    Object.assign(edge, { targetUnitId: "shape", member: null, operationId: undefined });
    fixtureItem(r.checks[0]).accessIds = [edge.id, "helper-loader"];
  });
  const findings = compareIsolation(before, comparisonInput("after")).findings;
  expect(findings.filter(({ change }) => change === "Existing violation")).toHaveLength(1);
  expect(findings.some(({ change }) => change === "New violation")).toBe(false);
});

test("several concrete reachable targets matching one policy remain separate", () => {
  const extra = (name: "before" | "after") => comparisonInput(name, ({ boundaryReview: r }) => {
    const check = fixtureItem(r.checks[0]);
    const edges = name === "after" ? ["history-shape-import"] : [];
    if (edges.length) r.accesses.push({ ...fixtureItem(r.accesses.find((site) => site.id === "history-loader-import")),
      id: fixtureItem(edges[0]), targetUnitId: "shape", operationId: undefined, member: null });
    r.checks.push({ ...check, id: "history-shape", targetUnitId: "shape", accessIds: edges });
  });
  expect(compareIsolation(extra("before"), extra("after")).findings.filter(({ change }) => change === "New violation")
    .map((finding) => finding.after?.targetUnitId).sort()).toEqual(["loader", "shape"]);
});

test("a value-only restriction cannot forbid a type reference", () => {
  const after = comparisonInput("after", ({ boundaryReview: review }) => {
    fixtureItem(review.rules[0]).kind = "path";
    fixtureItem(review.rules[0]).accessKinds = ["import"];
    const site = fixtureItem(review.accesses.find((a) => a.id === "history-loader-import"));
    site.kind = "type";
  });
  const facts = compareIsolation(comparisonInput("before"), after).findings;
  expect(facts.some((finding) => finding.change === "New violation")).toBe(false);
});

test("a permitted replacement and a resolved forbidden route are separate changes", () => {
  const original = routeInput("after", "deep import of a public operation", "an active public-path rule");
  const findings = compareIsolation(original, replacementInput()).findings;
  expect(findings.map(({ change }) => change)).toContain("Resolved violation");
  expect(findings.map(({ change }) => change)).toContain("Interface use changed");
  const limited = compareIsolation(original, replacementInput(true)).findings;
  expect(limited.map(({ change }) => change)).not.toContain("Resolved violation");
  expect(limited.map(({ change }) => change)).toContain("Comparison limited");
});

test("an explicit move binds the exact Before digest and grouping ignores record order", () => {
  const before = comparisonInput("after"), after = movedSiteInput(before.sha256);
  const result = compareIsolation(before, after);
  expect(result.findings.some((f) => f.change === "Existing violation")).toBe(true);
  if (after.baseline.formatVersion !== 6) throw new Error("Expected v6.");
  after.baseline.boundaryReview.checks.reverse();
  after.baseline.boundaryReview.accesses.reverse();
  expect(compareIsolation(before, after)).toEqual(result);
  expect(compareIsolation(before, movedSiteInput("a".repeat(64))).findings.some((f) => f.change === "Existing violation")).toBe(false);
});

test("an explicit exception changes permission without repairing the source", () => {
  const result = compareIsolation(comparisonInput("after"), exceptionInput());
  expect(result.findings.some((f) => f.change === "Policy or ownership changed" && f.after?.ruleId)).toBe(true);
  expect(result.findings.some((f) => f.change === "Resolved violation")).toBe(false);
});

test("remapping an internal access without an old site leaves a source edit unverified", () => {
  const before = comparisonInput("before", ({ boundaryReview: r }) => {
    fixtureItem(r.units.find((u) => u.id === "history")).ownerId = "configuration";
  });
  const changes = compareIsolation(before, comparisonInput("after")).findings;
  expect(changes.some((f) => f.change === "Policy or ownership changed" && f.reason.includes("unverified"))).toBe(true);
  expect(changes.some((f) => f.change === "New violation")).toBe(false);
});

test("changing policy and adding a source access records both facts", () => {
  const changes = compareIsolation(comparisonInput("before"), comparisonInput("policy")).findings.map((f) => f.change);
  expect(changes).toContain("Policy or ownership changed");
  expect(changes).toContain("Interface use changed");
});

test("negative claims require the same checker, scoped inventory and supported access kinds", () => {
  for (const problem of ["checker", "roots", "omitted-unit", "missing-kind", "unresolved-edge", "stale"]) {
    const before = comparisonInput("before", ({ boundaryReview: r }) => {
      const c = fixtureItem(r.checks[0]);
      if (problem === "checker") c.checkerVersion = "old";
      if (problem === "roots") c.coverage.roots = ["examples"];
      if (problem === "omitted-unit") c.coverage.examinedUnitIds = ["loader"];
      if (problem === "missing-kind") c.coverage.accessKinds = ["require"];
      if (problem === "unresolved-edge") c.coverage.unresolvedAccessIds = ["unknown-loader"];
      if (problem === "stale") r.status = "needs-refresh";
    });
    const result = compareIsolation(before, comparisonInput("after"));
    expect(result.findings.some((f) => f.change === "New violation"), problem).toBe(false);
    expect(result.findings.some((f) => f.change === "Comparison limited"), problem).toBe(true);
    expect(result.complete, problem).toBe(false);
  }
});

test("stale verdicts are suppressed while accepted policy changes on the same source remain visible", () => {
  const before = comparisonInput("after");
  const after = comparisonInput("after", (baseline) => {
    baseline.boundaryReview.status = "needs-refresh";
    fixtureItem(baseline.interfaces[0]).allowedConsumers = { value: ["collector"], status: "accepted", acceptanceRef: "decision-one",
      evidenceRefs: ["declare-configuration"] };
  });
  const changes = compareIsolation(before, after).findings.map((f) => f.change);
  expect(changes).toContain("Comparison limited");
  expect(changes).toContain("Policy or ownership changed");
  expect(changes).not.toContain("Existing violation");
});

test("unchanged accesses moving in and out of Production retain both sides for projection", () => {
  const application = comparisonInput("after"), tests = historyTestInput();
  for (const [old, current, expected] of [[application, tests, "Left production scope"], [tests, application, "Entered production scope"]] as const) {
    const result = compareIsolation(old, current);
    expect(result.findings.some((f) => f.change === expected && f.after?.accessIds.length && f.before?.accessIds.length)).toBe(true);
    expect(result.findings.some((f) => ["New violation", "Resolved violation"].includes(f.change))).toBe(false);
  }
});

test("a new target requires an explicitly reconciled scoped inventory", () => {
  const before = comparisonInput("before", ({ boundaryReview: r }) => { fixtureItem(r.checks[0]).coverage.inventoryRoots = ["src/config"]; });
  const after = comparisonInput("after", ({ boundaryReview: r }) => {
    const original = fixtureItem(r.units.find((unit) => unit.id === "loader"));
    r.units.push({ ...original, id: "other-loader", path: "src/config/secondary.ts", stableId: "example/secondary" });
    const added = fixtureItem(r.checks[0]);
    r.checks.push({ ...added, id: "original-loader", result: "absent", accessIds: [] });
    added.targetUnitId = "other-loader";
    added.coverage.examinedUnitIds.push("other-loader");
    for (const site of r.accesses.filter((site) => site.callerUnitId === "history" && site.targetUnitId === "loader")) {
      site.targetUnitId = "other-loader"; delete site.operationId;
    }
  });
  expect(compareIsolation(before, after).findings.some((f) => f.change === "New violation" && f.after?.targetUnitId === "other-loader")).toBe(true);
  expect(compareIsolation(after, before).findings.some((f) => f.change === "Resolved violation" && f.before?.targetUnitId === "other-loader")).toBe(true);
  expect(compareIsolation(comparisonInput("before"), after).findings.some((f) => f.change === "New violation")).toBe(false);
});

test("a complete old check cannot date a crossing after its caller changed role", () => {
  const before = comparisonInput("before", ({ boundaryReview: r }) => {
    const history = r.units.find(u => u.id === "history");
    if (history) history.roles = ["test"];
  });
  const changes = compareIsolation(before, comparisonInput("after")).findings;
  expect(changes.some(f => f.change === "New violation")).toBe(false);
  expect(changes.some(f => f.change === "Comparison limited" && f.reason.includes("First observed"))).toBe(true);
});

test("positive witnesses survive a second unassessed check regardless of record order", () => {
  const before = comparisonInput("after", ({ boundaryReview: r }) => {
    const first = r.checks[0];
    if (first) r.checks.unshift({ ...first, id: "other-check", result: "unknown", accessIds: [] });
  });
  const after = comparisonInput("after");
  const result = compareIsolation(before, after);
  expect(result.findings.map(f => f.change)).toContain("Existing violation");
  if (before.baseline.formatVersion === 6) before.baseline.boundaryReview.checks.reverse();
  expect(compareIsolation(before, after)).toEqual(result);
});

test("changed policy and direct ownership without any saved crossing remain observable", () => {
  const before = comparisonInput("before", ({ boundaryReview: r }) => { r.checks = []; r.accesses = []; });
  const after = comparisonInput("policy", ({ boundaryReview: r }) => {
    r.checks = []; r.accesses = [];
    const unit = r.units.find(u => u.id === "history");
    if (unit) unit.ownerId = "configuration";
  });
  const changes = compareIsolation(before, after).findings.filter(f => f.change === "Policy or ownership changed");
  expect(changes.some(f => f.after?.ruleId === "history-receives-global-config")).toBe(true);
  expect(changes.some(f => f.after?.callerUnitId === "history")).toBe(true);
});

test("conflicting verdicts on the same recorded access cannot date its introduction", () => {
  const before = routeInput("after", "deep import of a public operation", "an active public-path rule");
  const after = routeInput("after", "deep import of a public operation", "an active public-path rule");
  if (before.baseline.formatVersion !== 6) throw new Error("Expected a v6 input.");
  Object.assign(before.baseline.boundaryReview.checks[0] ?? {}, { result: "allowed" });
  before.sha256 = "1".repeat(64);
  const changes = compareIsolation(before, after).findings.map(f => f.change);
  expect(changes).not.toContain("New violation");
  expect(changes).toContain("Comparison limited");
});

test("two stable declarations at the same path with different identities remain unresolved", () => {
  const after = comparisonInput("after", ({ boundaryReview: r }) => {
    const unit = r.units.find(u => u.id === "loader");
    if (unit) unit.stableId = "unrelated-declaration";
  });
  expect(compareIsolation(comparisonInput("before"), after).findings.some(f => f.change === "New violation")).toBe(false);
});

test("evidence for many applicable rules has bounded size", () => {
  const populate = (r: BaselineBoundaryReview) => {
    const [rule] = r.rules, [check] = r.checks;
    if (!rule || !check) return;
    for (let i = 0; i < 40; ++i) {
      r.rules.push({ ...rule, id: "rule-" + i, name: "Rule " + i, settings: { ...rule.settings, name: "rule-" + i } });
      r.checks.push({ ...check, id: "check-" + i, ruleId: "rule-" + i });
    }
  };
  const before = comparisonInput("before", ({ boundaryReview }) => populate(boundaryReview));
  const after = comparisonInput("after", ({ boundaryReview: r }) => {
    populate(r);
    const call = r.accesses.find(a => a.id === "history-loader-call");
    if (call) for (let i = 0; i < 50; ++i) r.accesses.push({ ...call, id: "call-" + i });
  });
  const findings = compareIsolation(before, after).findings;
  const references = findings.flatMap(f => [f.before, f.after]).reduce((count, e) =>
    count + (e ? e.accessIds.length + e.resultIds.length + e.coverageIds.length : 0), 0);
  expect(references).toBeLessThan(1000);
});

test("a workspace uses the same exit role through an intermediate test file", () => {
  const before = comparisonInput("after", ({ boundaryReview: r }) => {
    const [check] = r.checks, site = r.accesses.find(a => a.id === "history-loader-import");
    if (!check || !site) return;
    r.accesses = r.accesses.filter(s => s.id !== "history-loader-call");
    r.accesses.push({ ...site, id: "helper-loader", callerUnitId: "adapter", callerRole: "test" });
    Object.assign(site, { targetUnitId: "adapter", targetRole: "test", member: null, operationId: undefined });
    check.accessIds = [site.id, "helper-loader"];
  });
  const findings = compareIsolation(before, comparisonInput("after")).findings;
  expect(findings.map(f => f.change)).toContain("Existing violation");
  expect(findings.map(f => f.change)).not.toContain("Entered production scope");
});

test("missing a reviewed intermediate unit prevents a new violation under narrower coverage", () => {
  const before = comparisonInput("before", ({ boundaryReview: r }) => {
    const [check] = r.checks;
    if (check) check.coverage.examinedUnitIds = ["history"];
  });
  const after = comparisonInput("after");
  expect(compareIsolation(before, after).findings.map(f => f.change)).not.toContain("New violation");
});

test("many direct rules over many routes cannot expand to an unbounded result", () => {
  const many = (name: "before" | "after") => comparisonInput(name, ({ boundaryReview: r }) => {
    const [rule] = r.rules, [check] = r.checks;
    if (!rule || !check) return;
    Object.assign(rule, { kind: "path", accessKinds: ["import"] });
    if (name === "after") {
      const site = fixtureItem(r.accesses.find(s => s.id === "history-loader-import"));
      for (let i = 0; i < 30; ++i) {
        const id = "route-" + i;
        r.accesses.push({ ...site, id, writtenPath: "imports/" + i });
        check.accessIds.push(id);
      }
    }
    for (let i = 0; i < 40; ++i) {
      const id = "r-" + i;
      r.rules.push({ ...rule, id, name: id, settings: { name: id } });
      r.checks.push({ ...check, id: "c-" + i, ruleId: id });
    }
  });
  const result = compareIsolation(many("before"), many("after"));
  expect(result.complete).toBe(false);
  expect(result.findings.length).toBeLessThan(500);
  expect(result.findings.some(f => f.change === "Comparison limited" && f.reason.includes("result limit"))).toBe(true);
});

test("ambiguous member moves cannot date a new route to a replacement declaration", () => {
  const before = routeInput("before", "deep import of a public operation", "an active public-path rule");
  const after = routeInput("after", "deep import of a public operation", "an active public-path rule");
  if (after.baseline.formatVersion !== 6) throw new Error("Expected v6.");
  const operation = fixtureItem(after.baseline.boundaryReview.operations.find(op => op.id === "load"));
  operation.stableId = "unrelated/member"; operation.member = "renamedLoader";
  const changes = compareIsolation(before, after).findings.map(f => f.change);
  expect(changes).not.toContain("New violation");
  expect(changes).toContain("Comparison limited");
});

test("a new rule for an unsearched access kind cannot establish a source addition", () => {
  const before = routeInput("before", "deep import of a public operation", "an active public-path rule");
  const after = routeInput("after", "deep import of a public operation", "an active public-path rule");
  if (after.baseline.formatVersion !== 6) throw new Error("Expected v6.");
  const r = after.baseline.boundaryReview;
  fixtureItem(r.rules[0]).accessKinds = ["type"];
  fixtureItem(r.checks[0]).coverage.accessKinds = ["type"];
  fixtureItem(r.accesses.find(s => s.id === "history-loader-import")).kind = "type";
  const found = compareIsolation(before, after).findings;
  expect(found.map(f => f.change)).toContain("Policy or ownership changed");
  expect(found.map(f => f.change)).not.toContain("Interface use changed");
  expect(found.some(f => f.change === "Comparison limited" && f.reason.includes("First observed"))).toBe(true);
});

test("a change to the source revision alone preserves an identical effective rule", () => {
  const before = comparisonInput("before", ({ boundaryReview }) => {
    fixtureItem(boundaryReview.rules[0]).revision = "earlier-source-bytes";
  });
  const result = compareIsolation(before, comparisonInput("after"));
  expect(result.findings.map(f => f.change)).toContain("New violation");
});

test("an unmatched proposed restriction leaves a recorded access in Needs review", () => {
  const before = comparisonInput("before", ({ boundaryReview: r }) => { r.rules = []; r.checks = []; });
  const after = comparisonInput("after", ({ boundaryReview: r }) => {
    fixtureItem(r.rules[0]).authority = "proposed";
    fixtureItem(r.checks[0]).result = "unknown";
  });
  const result = compareIsolation(before, after);
  expect(result.findings.some(f => f.change === "Needs review" && f.after?.ruleId === "history-receives-global-config")).toBe(true);
  expect(result.findings.map(f => f.change)).not.toContain("New violation");
});
