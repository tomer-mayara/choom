import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ArchitectureDetails } from "../../../src/components/architecture-details.tsx";
import { baselineSchema } from "../../../src/domain/baseline.ts";
import { baselineDetailsExample, baselineWithUnknownDetails, longAccessRules, recordedAcceptanceRef, recordedEvidenceRef, recordedMarkup } from "../../support/baseline-detail-fixtures.ts";
import { accepted, fixtureItem, proposed, reviewedBaseline } from "../../support/baseline-fixtures.ts";

afterEach(cleanup);

test("an interface's original record retains every saved value without changing it", () => {
  const baseline = baselineDetailsExample();
  const item = fixtureItem(baseline.interfaces);
  const original = structuredClone(item);
  render(<ArchitectureDetails baseline={baseline} panel={{ kind: "interface", interfaceId: item.id }} />);
  const summary = screen.getByText("Original record", { selector: "summary" });
  fireEvent.click(summary);
  const record = summary.closest("details")?.querySelector("pre")?.textContent;
  expect(JSON.parse(record ?? "null")).toEqual(original);
  expect(item).toEqual(original);
});

test("component details keep purpose, membership, grouping, and parent fields", () => {
  const baseline = baselineDetailsExample();
  const component = fixtureItem(baseline.components);
  const original = structuredClone(baseline);
  render(<ArchitectureDetails baseline={baseline} panel={{ kind: "component", componentId: component.id }} />);
  expect(screen.getByRole("heading", { name: component.name }).textContent).toBe(component.name);
  expect(screen.getByRole("group", { name: "Component ID" }).textContent).toContain(component.id);
  expect(screen.getByRole("group", { name: "Purpose" }).textContent).toContain(component.purpose.value);
  expect(screen.getByRole("group", { name: "Grouping reason" }).textContent).toContain(component.groupingReason.value);
  expect(JSON.parse(screen.getByRole("group", { name: "Paths" }).querySelector("pre")?.textContent ?? "null"))
    .toEqual(component.membership.value.paths);
  expect(JSON.parse(screen.getByRole("group", { name: "Excluded paths" }).querySelector("pre")?.textContent ?? "null"))
    .toEqual(component.membership.value.excludePaths);
  expect(screen.getByRole("group", { name: "Parent" }).textContent).toContain("Not recorded");
  expect(baseline).toEqual(original);
});

test("component details distinguish an absent field, a null parent, and empty exclusions", () => {
  const baseline = baselineWithUnknownDetails();
  const parent = fixtureItem(baseline.components);
  const child = fixtureItem(baseline.components, 1);
  const { rerender } = render(<ArchitectureDetails baseline={baseline} panel={{ kind: "component", componentId: parent.id }} />);
  const unknownParent = screen.getByRole("group", { name: "Parent" });
  expect(within(unknownParent).getByText("Unknown (null)")).toBeTruthy();
  expect(within(unknownParent).getByText("Proposed")).toBeTruthy();
  expect(screen.getByRole("group", { name: "Excluded paths" }).textContent).toContain("Not recorded");
  rerender(<ArchitectureDetails baseline={baseline} panel={{ kind: "component", componentId: child.id }} />);
  expect(screen.getByRole("group", { name: "Excluded paths" }).querySelector("pre")?.textContent).toBe("[]");
  const recordedParent = within(screen.getByRole("group", { name: "Parent" }));
  expect(recordedParent.getByText(parent.id)).toBeTruthy();
  expect(recordedParent.getByText("Accepted (recorded)")).toBeTruthy();
});

test("interface details retain owner, public access, consumers, and each promise", () => {
  const baseline = baselineDetailsExample();
  const item = fixtureItem(baseline.interfaces);
  render(<ArchitectureDetails baseline={baseline} panel={{ kind: "interface", interfaceId: item.id }} />);
  expect(screen.getByRole("group", { name: "Interface ID" }).textContent).toContain(item.id);
  expect(within(screen.getByRole("group", { name: "Owner" })).getByText("order-service")).toBeTruthy();
  expect(JSON.parse(screen.getByRole("group", { name: "Public access" }).querySelector("pre")?.textContent ?? "null"))
    .toEqual(["submitOrder", "readOrder"]);
  expect(JSON.parse(screen.getByRole("group", { name: "Allowed consumers" }).querySelector("pre")?.textContent ?? "null"))
    .toEqual(["order-system"]);
  const promises = within(screen.getByRole("group", { name: "Promises" }));
  for (const [name, value] of [
    ["Behavior", "Submit one approved order."], ["Data", "Return the recorded order ID."],
    ["Errors", "Reject an expired approval."], ["Lifecycle", "Keep an order until retention ends."],
  ] as const) expect(promises.getByRole("group", { name }).textContent).toContain(value);
});

test("unknown interface fields and unknown promise members remain distinct", () => {
  const baseline = baselineWithUnknownDetails();
  const item = fixtureItem(baseline.interfaces);
  const { rerender } = render(<ArchitectureDetails baseline={baseline} panel={{ kind: "interface", interfaceId: item.id }} />);
  for (const name of ["Owner", "Public access", "Allowed consumers", "Promises"]) {
    const field = within(screen.getByRole("group", { name }));
    expect(field.getByText("Unknown (null)")).toBeTruthy();
    expect(field.getByText("Proposed")).toBeTruthy();
  }
  expect(screen.queryByRole("group", { name: "Behavior" })).toBeNull();
  item.promises = proposed({ behavior: null, data: null, errors: null, lifecycle: null });
  rerender(<ArchitectureDetails baseline={baseline} panel={{ kind: "interface", interfaceId: item.id }} />);
  const promises = within(screen.getByRole("group", { name: "Promises" }));
  for (const name of ["Behavior", "Data", "Errors", "Lifecycle"]) {
    expect(within(promises.getByRole("group", { name })).getByText("Unknown (null)")).toBeTruthy();
  }
});

test("resource details retain long text and markup as inert values with each statement", () => {
  const baseline = baselineDetailsExample();
  const item = fixtureItem(baseline.resources);
  const { container } = render(<ArchitectureDetails baseline={baseline} panel={{ kind: "resource", resourceId: item.id }} />);
  expect(screen.getByRole("group", { name: "Resource ID" }).textContent).toContain(item.id);
  expect(within(screen.getByRole("group", { name: "Identity" })).getByText(recordedMarkup)).toBeTruthy();
  expect(within(screen.getByRole("group", { name: "Owner" })).getByText("order-service")).toBeTruthy();
  expect(within(screen.getByRole("group", { name: "Access rules" })).getByText(longAccessRules(), { normalizer: (value) => value })).toBeTruthy();
  expect(container.querySelector("a, img, script, iframe")).toBeNull();
});

test("unknown resource values keep their own recorded statuses", () => {
  const baseline = baselineWithUnknownDetails();
  const item = fixtureItem(baseline.resources);
  item.identity = accepted(null);
  render(<ArchitectureDetails baseline={baseline} panel={{ kind: "resource", resourceId: item.id }} />);
  for (const name of ["Identity", "Owner", "Access rules"]) {
    const field = within(screen.getByRole("group", { name }));
    expect(field.getByText("Unknown (null)")).toBeTruthy();
    expect(field.getByText(name === "Identity" ? "Accepted (recorded)" : "Proposed")).toBeTruthy();
  }
});

test("baseline details retain format and lineage, including a null parent ID", () => {
  const baseline = baselineDetailsExample();
  const { rerender } = render(<ArchitectureDetails baseline={baseline} panel={{ kind: "baseline" }} />);
  expect(within(screen.getByRole("group", { name: "Format version" })).getByText("1")).toBeTruthy();
  expect(within(screen.getByRole("group", { name: "Baseline ID" })).getByText(baseline.id)).toBeTruthy();
  expect(within(screen.getByRole("group", { name: "Parent baseline ID" })).getByText("baseline-before-details")).toBeTruthy();
  baseline.parentId = null;
  rerender(<ArchitectureDetails baseline={baseline} panel={{ kind: "baseline" }} />);
  const parent = within(screen.getByRole("group", { name: "Parent baseline ID" }));
  expect(parent.getByText("No parent baseline (null)")).toBeTruthy();
  expect(parent.queryByText("Unknown (null)")).toBeNull();
});

test("rules keep all recorded JSON and opaque references without evaluating them", () => {
  const baseline = baselineDetailsExample();
  const rule = fixtureItem(baseline.rules);
  const original = structuredClone(baseline);
  const { container } = render(<ArchitectureDetails baseline={baseline} panel={{ kind: "rules" }} />);
  const row = container.querySelector("details");
  if (!row) throw new Error("The Rules list must contain an expandable rule.");
  expect(row.querySelector("summary")?.textContent).toContain(rule.name);
  expect(row.querySelector("summary")?.textContent).toContain(rule.id);
  expect(screen.queryByRole("group", { name: "Subject" })).toBeNull();
  fireEvent.click(within(row).getByText(rule.name));
  expect(screen.getByRole("group", { name: "Rule ID" }).textContent).toContain(rule.id);
  for (const [name, statement] of [["Subject", rule.subject], ["Expected", rule.expected], ["Check", rule.check]] as const) {
    const field = screen.getByRole("group", { name });
    expect(JSON.parse(field.querySelector("pre")?.textContent ?? "null")).toEqual(statement.value);
  }
  const expected = within(screen.getByRole("group", { name: "Expected" }));
  expect(expected.getByRole("group", { name: "Evidence references" }).textContent).toContain(recordedEvidenceRef);
  expect(within(expected.getByRole("group", { name: "Acceptance reference" })).getByText(recordedAcceptanceRef)).toBeTruthy();
  expect(container.querySelector("a, img, script, iframe")).toBeNull();
  expect(screen.queryByText(/^(Passed|Failed|Verified|Valid)$/)).toBeNull();
  expect(baseline).toEqual(original);
});

test("unknown rule statements stay different from an empty object", () => {
  const baseline = baselineWithUnknownDetails();
  const { container } = render(<ArchitectureDetails baseline={baseline} panel={{ kind: "rules" }} />);
  const row = container.querySelector("details");
  if (!row) throw new Error("The Rules list must contain an expandable rule.");
  fireEvent.click(within(row).getByText(fixtureItem(baseline.rules).name));
  expect(screen.getByRole("group", { name: "Subject" }).querySelector("pre")?.textContent).toBe("{}");
  for (const name of ["Expected", "Check"]) {
    expect(within(screen.getByRole("group", { name })).getByText("Unknown (null)")).toBeTruthy();
  }
});

test("all 21 reviewed rules have controls without rendering their unexpanded details", () => {
  const baseline = baselineSchema.parse(reviewedBaseline("full"));
  const { container } = render(<ArchitectureDetails baseline={baseline} panel={{ kind: "rules" }} />);
  const rows = [...container.querySelectorAll("summary")];
  expect(rows).toHaveLength(21);
  for (const [index, rule] of baseline.rules.entries()) {
    expect(rows[index]?.textContent).toContain(rule.name);
    expect(rows[index]?.textContent).toContain(rule.id);
  }
  expect(screen.queryByRole("group", { name: "Subject" })).toBeNull();
});

test("each statement in every record kind keeps its own status and opaque references", () => {
  const baseline = baselineDetailsExample();
  const parent = fixtureItem(baseline.components);
  const child = fixtureItem(baseline.components, 1);
  const item = fixtureItem(baseline.interfaces);
  const resource = fixtureItem(baseline.resources);
  const rule = fixtureItem(baseline.rules);
  const cases = [
    [{ kind: "component", componentId: parent.id }, [
      ["Purpose", parent.purpose], ["Membership", parent.membership], ["Grouping reason", parent.groupingReason],
    ]],
    [{ kind: "component", componentId: child.id }, [
      ["Purpose", child.purpose], ["Membership", child.membership], ["Grouping reason", child.groupingReason], ["Parent", child.parent],
    ]],
    [{ kind: "interface", interfaceId: item.id }, [
      ["Owner", item.owner], ["Public access", item.publicAccess], ["Allowed consumers", item.allowedConsumers], ["Promises", item.promises],
    ]],
    [{ kind: "resource", resourceId: resource.id }, [
      ["Identity", resource.identity], ["Owner", resource.owner], ["Access rules", resource.accessRules],
    ]],
    [{ kind: "rules" }, [["Subject", rule.subject], ["Expected", rule.expected], ["Check", rule.check]]],
  ] as const;
  for (const [panel, statements] of cases) {
    const { container } = render(<ArchitectureDetails baseline={baseline} panel={panel} />);
    if (panel.kind === "rules") fireEvent.click(screen.getByText(rule.name));
    for (const [name, statement] of statements) {
      if (!statement) throw new Error(`The fixture needs a ${name} statement.`);
      const field = within(screen.getByRole("group", { name }));
      expect(field.getByText(statement.status === "accepted" ? "Accepted (recorded)" : "Proposed")).toBeTruthy();
      expect(field.getByText("Evidence not loaded")).toBeTruthy();
      expect(JSON.parse(field.getByRole("group", { name: "Evidence references" }).querySelector("pre")?.textContent ?? "null"))
        .toEqual(statement.evidenceRefs);
      if (statement.status === "accepted") {
        const reference = field.getByRole("group", { name: "Acceptance reference" });
        expect(within(reference).getByText(statement.acceptanceRef)).toBeTruthy();
      } else expect(field.queryByRole("group", { name: "Acceptance reference" })).toBeNull();
    }
    expect(container.querySelector("a[href], img, script, iframe")).toBeNull();
    cleanup();
  }
});
