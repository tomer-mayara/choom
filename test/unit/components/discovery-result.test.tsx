import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "../../../src/App.tsx";
import type { SelectedBaseline } from "../../../src/architecture/load-workflow.ts";
import { ArchitectureDiagram } from "../../../src/components/architecture-diagram.tsx";
import { pending } from "../../support/baseline-workflow-fixtures.ts";
import { deferredFile, deferredReason, discoveryFixture, discoveryOnEveryItemKind, type DiscoveryFixture } from "../../support/discovery-fixtures.ts";
import { discoveryResultText, discoveryWorkflow } from "../../support/discovery-workflow-fixtures.ts";
import { selectedText } from "../../support/duplication-workflow-fixtures.ts";

afterEach(cleanup);

function show(fixture: DiscoveryFixture, attached = true, controls: { open?: () => void; remove?: () => void } = {}) {
  const { baseline, sha256, result } = fixture;
  const layout = { nodes: baseline.components.map(({ id }, index) => ({ id, position: { x: index * 260, y: 0 }, width: 240, height: 88 })) };
  render(<ArchitectureDiagram baseline={baseline} layout={layout} baselineSha256={sha256} discovery={attached ? { result } : null}
    onOpenDiscoveryResult={controls.open} onRemoveDiscoveryResult={controls.remove} />);
}

const header = (name: string) => screen.getByRole("button", { name });
const panel = (name: string) => screen.getByRole("dialog", { name });
const recorded = (dialog: string) => within(within(panel(dialog)).getByRole("region", { name: "Recorded questions and gaps" }));

function openDiscoveryPanel() {
  fireEvent.click(screen.getByRole("button", { name: "Discovery" }));
  return within(panel("Discovery"));
}

test("without an attachment the viewer says that no discovery result is attached, not that there are no questions", () => {
  const open = mock(() => {});
  show(discoveryFixture(), false, { open });
  expect(within(header("Billing, billing")).queryByText(/recorded/)).toBeNull();
  const discovery = openDiscoveryPanel();
  expect(discovery.getByText("No discovery result attached")).toBeTruthy();
  expect(discovery.queryByText(/no questions/i)).toBeNull();
  fireEvent.click(discovery.getByRole("button", { name: "Open discovery result" }));
  expect(open).toHaveBeenCalledTimes(1);
  expect(discovery.queryByRole("button", { name: "Remove discovery result" })).toBeNull();
  fireEvent.click(header("Billing, billing"));
  expect(recorded("Component details").getByText("No discovery result attached")).toBeTruthy();
});

test("the built-in example cannot attach a discovery result", () => {
  show(discoveryFixture(), false);
  const discovery = openDiscoveryPanel();
  expect(discovery.getByText("Open a saved baseline before attaching a discovery result.")).toBeTruthy();
  expect(discovery.queryByRole("button", { name: "Open discovery result" })).toBeNull();
});

test("Billing shows its two recorded questions on its header and in its details", () => {
  show(discoveryFixture());
  const billing = header("Billing, billing");
  expect(within(billing).getByText("2 recorded questions")).toBeTruthy();
  expect(billing.getAttribute("aria-describedby")).toContain("discovery-records-billing");
  expect(document.getElementById("discovery-records-billing")?.textContent).toBe("2 recorded questions");
  expect(within(header("Checkout, checkout")).queryByText(/recorded/)).toBeNull();
  fireEvent.click(billing);
  const list = recorded("Component details");
  expect(list.getByRole("heading", { name: "Recorded questions (2)" })).toBeTruthy();
  for (const { text, id } of discoveryFixture().result.questions) {
    expect(list.getByText(text)).toBeTruthy();
    expect(list.getByText(id)).toBeTruthy();
  }
  expect(list.getByText(/recorded questions and gaps to review, not defects/)).toBeTruthy();
  expect(list.queryByRole("heading", { name: /Recorded gaps/ })).toBeNull();
});

test("the Discovery panel summarizes the result and lists the deferred file in a group that the reader can collapse", () => {
  const remove = mock(() => {});
  show(discoveryFixture(), true, { remove });
  const discovery = openDiscoveryPanel();
  const summary = within(discovery.getByRole("region", { name: "Discovery summary" }));
  expect(summary.getByText("2 recorded questions and 1 recorded gap.")).toBeTruthy();
  expect(summary.getByText(/These are recorded questions and gaps to review, not defects\./)).toBeTruthy();
  const unplaced = discovery.getByRole("region", { name: "Unplaced" });
  expect(within(unplaced).getByRole("heading", { name: "Unplaced (1)" })).toBeTruthy();
  const deferred = unplaced.querySelector<HTMLDetailsElement>("details[data-section='deferred-gaps']");
  if (!deferred) throw new Error("The deferred gaps need their own group.");
  expect(deferred.open).toBe(true);
  expect(within(deferred).getByText(deferredReason)).toBeTruthy();
  expect(within(deferred).getByText(deferredFile)).toBeTruthy();
  expect(within(deferred).getByText("deferred")).toBeTruthy();
  fireEvent.click(within(deferred).getByText("Deferred gaps (1)"));
  expect(deferred.open).toBe(false);
  fireEvent.click(discovery.getByRole("button", { name: "Remove discovery result" }));
  expect(remove).toHaveBeenCalledTimes(1);
});

test("records about an interface, a resource and a rule appear in their details, not on the component header", () => {
  show(discoveryOnEveryItemKind());
  expect(within(header("Billing, billing")).getByText("2 recorded questions")).toBeTruthy();
  fireEvent.click(header("Billing, billing"));
  fireEvent.click(within(screen.getByRole("region", { name: "Owned interfaces" })).getByRole("button", { name: "Invoice API, invoice-api" }));
  expect(recorded("Interface details").getByText("May Checkout use the Invoice API?")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Baseline details" }));
  fireEvent.click(within(screen.getByRole("region", { name: "Resources" })).getByRole("button", { name: "Invoices, invoice-store" }));
  const resource = recorded("Resource details");
  expect(resource.getByText("No code writes the invoice store.")).toBeTruthy();
  expect(resource.getByText("unknown-owner")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Rules" }));
  fireEvent.click(within(panel("Rules")).getByText("Invoice access"));
  const rule = recorded("Rules");
  expect(rule.getByRole("heading", { name: "Recorded gaps (1)" })).toBeTruthy();
  expect(rule.getByText("The access rule has no check yet.")).toBeTruthy();
  expect(rule.getByText("a-kind-that-the-viewer-does-not-know")).toBeTruthy();
});

test("a header with questions and gaps gives one count and names both in its description", () => {
  const fixture = discoveryFixture();
  fixture.result.gaps.push({ id: "s4-001-gap-003", kind: "missing-input", subjectRefs: ["billing.membership"],
    reason: "The tax tables are not in the snapshot.", evidenceRefs: ["s4-001-file@review.yaml"] });
  show(fixture);
  expect(within(header("Billing, billing")).getByText("3 recorded questions and gaps")).toBeTruthy();
  expect(document.getElementById("discovery-records-billing")?.getAttribute("title")).toBe("2 recorded questions and 1 recorded gap");
});

test("the workspace announces a discovery load, keeps the attachment after a refusal, and removes it on request", async () => {
  const { workflow, dependencies } = discoveryWorkflow();
  await workflow.openBaseline();
  render(<App workspace={{ workflow }} />);
  fireEvent.click(screen.getByRole("switch", { name: "Show non-production" }));
  const reading = pending<Awaited<ReturnType<SelectedBaseline["read"]>>>();
  dependencies.selectDiscoveryResult = async () => ({ read: () => reading.promise });
  const discovery = openDiscoveryPanel();
  fireEvent.click(discovery.getByRole("button", { name: "Open discovery result" }));
  await waitFor(() => expect(screen.getByText("Reading the discovery result…")).toBeTruthy());
  reading.resolve(await selectedText(discoveryResultText()).read(new AbortController().signal));
  await waitFor(() => expect(screen.getByText("Discovery result ready.")).toBeTruthy());
  expect(discovery.getByText("2 recorded questions and 1 recorded gap.")).toBeTruthy();
  dependencies.selectDiscoveryResult = async () => selectedText(discoveryResultText((result) => { result.baselineDigest = "0".repeat(64); }));
  fireEvent.click(discovery.getByRole("button", { name: "Open discovery result" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent)
    .toStartWith("The discovery result validation failed: The discovery result is for the baseline file with SHA-256"));
  expect(discovery.getByText("2 recorded questions and 1 recorded gap.")).toBeTruthy();
  fireEvent.click(discovery.getByRole("button", { name: "Remove discovery result" }));
  await waitFor(() => expect(discovery.getByText("No discovery result attached")).toBeTruthy());
});
