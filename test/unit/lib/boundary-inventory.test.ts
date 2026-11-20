import { expect, test } from "bun:test";
import { boundaryFixture } from "../../support/boundary-baseline.ts";
import { BoundaryInventory } from "../../../src/lib/boundary-inventory.ts";

test("keeps each independent operation at its direct owner with its actual external callers", () => {
  const view = new BoundaryInventory(boundaryFixture(), false);
  const loader = view.components.get("configuration")?.provides.find(({ name }) => name === "GlobalConfigLoader.load()");
  expect(loader?.permittedCallers).toBeNull();
  expect(loader?.callers.get("production")?.map(({ name }) => name)).toEqual(["Collector", "Local Codex history"]);
  expect(view.components.get("history")?.uses.map(({ kind }) => kind)).toContain("Type use");
});

test("counts one caller per operation and role and keeps distinct source sites for expansion", () => {
  const file = boundaryFixture();
  const [site] = file.boundaryReview.accesses;
  if (!site) throw new Error("Missing collector call");
  file.boundaryReview.accesses.push({ ...site, id: "other-line" }, { ...site, id: "test-line", callerRole: "test" });
  const group = new BoundaryInventory(file, true).operations.get("load")?.callers;
  expect(group?.get("production")?.find(({ name }) => name === "Collector")?.sites).toHaveLength(2);
  expect(group?.get("test")?.map(({ name }) => name).sort()).toEqual(["Collector", "In-memory adapter"]);
});

test("requires opt-in for each non-production role and keeps the specific role and uncertainty reason", () => {
  const file = boundaryFixture();
  const component = file.boundaryReview.componentScopes.find((item) => item.componentId === "test-adapter");
  if (!component) throw new Error("Missing adapter");
  for (const role of ["development", "build", "ci", "environment", "benchmark", "example", "unknown"] as const) {
    component.roles = [role]; component.reason = "Registration evidence is incomplete.";
    expect(new BoundaryInventory(file, false).components.has("test-adapter")).toBe(false);
    const all = new BoundaryInventory(file, true).components.get("test-adapter");
    expect(all?.roleLabel).not.toBe("Test component");
    expect(all?.reason).toBe(component.reason);
  }
  component.roles = ["production", "test"];
  expect(new BoundaryInventory(file, true).components.get("test-adapter")?.roleLabel).toBe("Mixed scope");
  expect(new BoundaryInventory(file, false).components.get("test-adapter")?.provides).toHaveLength(0);
});

test("withholds stale counts from a decision copy while retaining raw evidence", () => {
  const file = boundaryFixture(); file.boundaryReview.status = "needs-refresh";
  const inventory = new BoundaryInventory(file, true);
  expect(inventory.fresh).toBe(false);
  expect(inventory.components.get("configuration")?.provides).toHaveLength(0);
  expect(inventory.arcs).toHaveLength(0);
  expect(inventory.baseline.boundaryReview.accesses.length).toBeGreaterThan(0);
});

test("production layout climbs through excluded parents and retains the recorded owner", async () => {
  const { productionBaseline } = await import("../../../src/lib/production-baseline.ts");
  const file = boundaryFixture();
  const configuration = file.components.find((item) => item.id === "configuration");
  const adapter = file.components.find((item) => item.id === "test-adapter");
  if (!configuration || !adapter) throw new Error("Missing owners");
  const parent = (value: string) => ({ value, status: "proposed" as const, evidenceRefs: ["review"] });
  configuration.parent = parent("test-adapter"); adapter.parent = parent("collector");
  const visible = productionBaseline(file);
  expect(visible.components.find((item) => item.id === "configuration")?.parent?.value).toBe("collector");
  expect(new BoundaryInventory(file, false).operations.get("load")?.owner).toBe("configuration");
  expect(configuration.parent.value).toBe("test-adapter");
});

test("a production caller's finding exposes only its approved label and line range for an excluded target", async () => {
  const { excludedTargetBaseline } = await import("../../support/boundary-view-fixtures.ts");
  const file = excludedTargetBaseline();
  const finding = new BoundaryInventory(file, false).components.get("history")?.findings[0];
  expect(finding?.label).toBe("Production code reaches an excluded target");
  expect(finding?.callerLocation).toBe("Caller lines 3–3");
  expect(finding?.target).toBeUndefined();
  expect(finding?.sites).toHaveLength(0);
  const expanded = new BoundaryInventory(file, true);
  const edge = expanded.arcs.find((arc) => arc.consumerId === "history" && arc.ownerId === "test-adapter");
  expect(edge && expanded.arcLabels.get(edge.id)).toContain("Production → Test");
  const full = expanded.components.get("history")?.findings[0];
  expect(full?.target).toBe("In-memory adapter");
  expect(full?.sites[0]?.route).toBe("../test/adapter");
  const access = file.boundaryReview.accesses.find((item) => item.id === "history-loader-import");
  if (!access) throw new Error("Missing test import");
  access.callerRole = "test";
  expect(new BoundaryInventory(file, false).components.get("history")?.findings).toHaveLength(0);
});

test.each([1, 2, 3, 4, 5] as const)("withholds an unclassified v%i inventory without changing its records", async (formatVersion) => {
  const { productionBaseline } = await import("../../../src/lib/production-baseline.ts");
  const input = boundaryFixture();
  const legacy = { formatVersion, id: input.id, parentId: null, components: input.components,
    interfaces: [], rules: [], resources: [] };
  const original = structuredClone(legacy);
  expect(productionBaseline(legacy).components).toEqual([]);
  expect(legacy).toEqual(original);
});

test("opt-in keeps an unresolved use separate and explains a missing component role", () => {
  const file = boundaryFixture();
  const review = file.boundaryReview;
  const ref = review.accesses.find((item) => item.id === "history-loader-import");
  if (!ref) throw new Error("Missing import");
  review.accesses.push({ ...ref, id: "computed", targetUnitId: null, operationId: undefined, targetRole: "unknown",
    writtenPath: "load(key)", kind: "dynamic-import", member: null, reason: "The computed binding is unknown." });
  review.componentScopes = review.componentScopes.filter((item) => item.componentId !== "test-adapter");
  const all = new BoundaryInventory(file, true);
  expect(all.components.get("test-adapter")?.reason).toContain("scope review");
  expect(all.unresolved.map((site) => site.reason)).toContain("The computed binding is unknown.");
  expect(new BoundaryInventory(file, false).unresolved).toHaveLength(0);
});

test("keeps an interface without reviewed members under Scope unknown after opt-in", () => {
  const file = boundaryFixture();
  const item = file.interfaces[0];
  if (!item) throw new Error("Missing interface");
  file.interfaces.push({ ...item, id: "undocumented-port", name: "Unreviewed port" });
  expect(new BoundaryInventory(file, false).operations.has("interface:undocumented-port")).toBe(false);
  expect(new BoundaryInventory(file, true).operations.get("interface:undocumented-port")?.roles).toEqual(["unknown"]);
});
