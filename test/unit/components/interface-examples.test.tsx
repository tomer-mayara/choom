import { afterEach, expect, test } from "bun:test";
import { createRef } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ArchitectureDetails } from "../../../src/components/architecture-details.tsx";
import { ArchitectureDiagram } from "../../../src/components/architecture-diagram.tsx";
import { fixtureItem } from "../../support/baseline-fixtures.ts";
import { selectInterfaceTab } from "../../support/interface-details-dom.ts";
import { failureExampleText, interfaceExampleFixture, literalExampleText } from "../../support/interface-example-fixtures.ts";

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
afterEach(() => {
  cleanup();
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else Reflect.deleteProperty(navigator, "clipboard");
});

function view(baseline = interfaceExampleFixture()) {
  const item = fixtureItem(baseline.interfaces);
  const mounted = render(<ArchitectureDetails baseline={baseline} panel={{ kind: "interface", interfaceId: item.id }} />);
  return { ...mounted, baseline, item };
}
const sample = () => within(screen.getByRole("tabpanel", { name: "Example" }));
const sampleText = () => sample().getByRole("group", { name: "Example" }).querySelector("pre")?.textContent;
function failureCase() { fireEvent.click(sample().getByRole("button", { name: "An empty order, empty-order" })); }

test("Example identifies the entry and starts with its first saved case", () => {
  view();
  expect(screen.queryByRole("tab", { name: "Example" })).toBeTruthy();
  selectInterfaceTab("Example");
  expect(sample().getByRole("heading", { name: "Create invoice" })).toBeTruthy();
  expect(sample().getByRole("button", { name: "A valid order, valid-order" }).getAttribute("aria-pressed")).toBe("true");
  expect(sampleText()).toBe("createInvoice(order)");
  expect(sample().getByText("Source-reviewed (recorded)")).toBeTruthy();
  expect(sample().getByText("Proposed")).toBeTruthy();
  expect(sample().getByText("Choom has not run this example.")).toBeTruthy();
});

function clipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
}
function copy() { fireEvent.click(sample().getByRole("button", { name: "Copy example" })); }
const feedback = () => sample().getByRole("status").textContent;
function changeEntry(name: string) {
  selectInterfaceTab("Overview"); fireEvent.click(screen.getByRole("button", { name })); selectInterfaceTab("Example");
}

test("Copy example writes exact saved bytes and announces completion", async () => {
  const baseline = interfaceExampleFixture();
  const entry = fixtureItem(fixtureItem(baseline.interfaces).documentation?.entries ?? []);
  const text = "\tcreateInvoice(order)\r\n// café  \n";
  fixtureItem(entry.examples).content.value.text = text;
  const writes: string[] = [];
  clipboard(async (value) => { writes.push(value); });
  view(baseline); selectInterfaceTab("Example");
  await act(async () => copy());
  expect(writes).toEqual([text]);
  expect(feedback()).toBe("Example copied.");
  expect(sampleText()).toBe(text);
});

test.each(["rejection", "synchronous failure", "unavailable"])("%s leaves the text readable and gives manual-copy guidance", async (outcome) => {
  if (outcome === "unavailable") Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  else clipboard(() => {
    if (outcome === "synchronous failure") throw new Error("private failure details");
    return Promise.reject(new Error("private failure details"));
  });
  view(); selectInterfaceTab("Example"); failureCase();
  await act(async () => copy());
  expect(feedback()).toBe("Could not copy. Select the example text and copy it manually.");
  expect(sampleText()).toBe(failureExampleText);
  expect(sample().queryByText("Example copied.")).toBeNull();
  expect(sample().queryByText(/private failure details/)).toBeNull();
});

test("tab return preserves the example, detailed result, and copy feedback", async () => {
  clipboard(async () => {});
  view(); selectInterfaceTab("Example"); failureCase();
  fireEvent.click(sample().getByText("Detailed result", { selector: "summary" }));
  await act(async () => copy());
  selectInterfaceTab("Sources"); selectInterfaceTab("Example");
  expect(sampleText()).toBe(failureExampleText);
  expect(sample().getByText("Detailed result", { selector: "summary" }).closest("details")?.open).toBe(true);
  expect(feedback()).toBe("Example copied.");
});

test.each(["example", "entry with a repeated example ID", "entry A to B to A"])("a pending copy cannot update feedback after changing %s", async (change) => {
  const pending = Promise.withResolvers<void>();
  clipboard(() => pending.promise);
  view(); selectInterfaceTab("Example");
  fireEvent.click(sample().getByText("Detailed result", { selector: "summary" }));
  copy();
  if (change === "example") failureCase();
  else {
    changeEntry("Invoice data, invoice-data");
    if (change === "entry A to B to A") changeEntry("Create invoice, create-invoice");
  }
  const currentText = sampleText();
  expect(feedback()).toBe("");
  expect(sample().queryByText("Detailed result", { selector: "summary" })?.closest("details")?.open ?? false).toBe(false);
  await act(async () => { pending.resolve(); await pending.promise; });
  expect(feedback()).toBe("");
  expect(sampleText()).toBe(currentText);
});

test.each(["success", "failure"])("an older copy cannot replace a newer %s", async (latest) => {
  const first = Promise.withResolvers<void>(); const second = Promise.withResolvers<void>();
  let requests = 0;
  clipboard(() => requests++ === 0 ? first.promise : second.promise);
  view(); selectInterfaceTab("Example"); copy(); copy();
  await act(async () => {
    if (latest === "success") second.resolve(); else second.reject(new Error("new denied"));
    await second.promise.catch(() => {});
  });
  const expected = latest === "success" ? "Example copied." : "Could not copy. Select the example text and copy it manually.";
  expect(feedback()).toBe(expected);
  await act(async () => {
    if (latest === "success") first.reject(new Error("old denied")); else first.resolve();
    await first.promise.catch(() => {});
  });
  expect(feedback()).toBe(expected);
});

test("copy completion remains valid after a tab change with the same selection", async () => {
  const pending = Promise.withResolvers<void>(); clipboard(() => pending.promise);
  view(); selectInterfaceTab("Example"); copy(); selectInterfaceTab("Sources");
  await act(async () => { pending.resolve(); await pending.promise; });
  selectInterfaceTab("Example");
  expect(feedback()).toBe("Example copied.");
});

test("closing a frame and opening the same IDs cannot inherit pending copy feedback", async () => {
  const pending = Promise.withResolvers<void>(); clipboard(() => pending.promise);
  const first = view(); selectInterfaceTab("Example"); copy(); first.unmount();
  view(); selectInterfaceTab("Example");
  await act(async () => { pending.resolve(); await pending.promise; });
  expect(feedback()).toBe("");
  expect(sampleText()).toBe("createInvoice(order)");
});

test("tab return restores one reading position and new examples reset it", () => {
  const baseline = interfaceExampleFixture();
  render(<ArchitectureDiagram baseline={baseline} layout={{ nodes: baseline.components.map(({ id }, index) => ({
    id, position: { x: index * 260, y: 0 }, width: 240, height: 88,
  })) }} />);
  fireEvent.click(screen.getByRole("button", { name: "Billing, billing" }));
  fireEvent.click(within(screen.getByRole("region", { name: "Owned interfaces" })).getByRole("button", { name: "Invoice API, invoice-api" }));
  selectInterfaceTab("Example");
  const content = screen.getByLabelText("Record content");
  content.scrollTop = 300;
  selectInterfaceTab("Sources");
  expect(content.scrollTop).toBe(0);
  content.scrollTop = 40;
  selectInterfaceTab("Example");
  expect(content.scrollTop).toBe(300);
  failureCase();
  expect(content.scrollTop).toBe(0);
  content.scrollTop = 75;
  changeEntry("Invoice data, invoice-data");
  expect(content.scrollTop).toBe(0);
  changeEntry("Create invoice, create-invoice");
  expect(sampleText()).toBe("createInvoice(order)");
  expect(content.scrollTop).toBe(0);
});

test("a failure example shows its authored explanation before the disclosed excerpt", () => {
  view(); selectInterfaceTab("Example"); failureCase();
  expect(sampleText()).toBe(failureExampleText);
  expect(sample().getByRole("group", { name: "Example input" }).textContent).toContain('{"items":[]}');
  const summary = sample().getByText("Detailed result", { selector: "summary" });
  expect(summary.closest("details")?.open).toBe(false);
  expect(summary.closest("details")?.querySelector("pre")).toBeNull();
  const explanation = sample().getByText("The order is rejected because it has no items.");
  expect(explanation.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(summary);
  expect(sample().getByText("Result excerpt")).toBeTruthy();
  expect(summary.closest("details")?.querySelector("pre")?.textContent).toBe('{"error":"Order has no items"}');
  expect(sample().getByText("Illustrative example")).toBeTruthy();
  expect(sample().getByText("Accepted (recorded)")).toBeTruthy();
});

test("a data sample stays neutral and missing input/result are not invented", () => {
  view();
  fireEvent.click(screen.getByRole("button", { name: "Invoice data, invoice-data" }));
  selectInterfaceTab("Example");
  expect(sample().getByRole("heading", { name: "Invoice data" })).toBeTruthy();
  expect(sampleText()).toBe('{"id":"saved-invoice"}\n');
  expect(sample().getByText("No input recorded for this example.")).toBeTruthy();
  expect(sample().getByText("No result recorded for this example.")).toBeTruthy();
  expect(sample().queryByText(/HTTP|response|call\(/i)).toBeNull();
});

test("an empty entry never borrows another entry's example", () => {
  view();
  fireEvent.click(screen.getByRole("button", { name: "Invoice type, invoice-type" }));
  selectInterfaceTab("Example");
  expect(sample().getByText("No example recorded for this entry.")).toBeTruthy();
  expect(sample().queryByRole("button", { name: "Copy example" })).toBeNull();
  expect(screen.getByRole("tabpanel", { name: "Example" }).querySelector("pre")).toBeNull();
});

test("saved markup remains literal and samples change without changing the baseline", () => {
  const { item, container } = view();
  const original = structuredClone(item);
  selectInterfaceTab("Example");
  fireEvent.click(sample().getByRole("button", { name: "Literal sample, literal-sample" }));
  expect(sampleText()).toBe(literalExampleText);
  expect(container.querySelector("img, script, iframe, a[href]")).toBeNull();
  expect(item).toEqual(original);
});

function boundedView() {
  const content = createRef<HTMLDivElement>();
  const baseline = interfaceExampleFixture();
  render(<div ref={content}><ArchitectureDetails baseline={baseline} panel={{ kind: "interface", interfaceId: "invoice-api" }} contentRef={content} /></div>);
  const area = content.current;
  if (!area) throw new Error("The inspector content must be mounted.");
  area.getBoundingClientRect = () => new DOMRect(0, 0, 400, 160);
  const tabs = screen.getByRole("tablist", { name: "Interface views" });
  tabs.getBoundingClientRect = () => new DOMRect(0, Math.max(0, 180 - area.scrollTop), 400, 40);
  return area;
}

test("switching a short panel keeps its focused tab visible without discarding saved reading positions", () => {
  const area = boundedView();
  const tab = screen.getByRole("tab", { name: "Example" });
  tab.getBoundingClientRect = () => new DOMRect(0, Math.max(0, 180 - area.scrollTop), 100, 40);
  act(() => tab.focus()); selectInterfaceTab("Example");
  expect(document.activeElement).toBe(tab);
  expect(tab.getBoundingClientRect().bottom).toBeLessThanOrEqual(160);
  area.scrollTop = 600; selectInterfaceTab("Sources"); selectInterfaceTab("Example");
  expect(area.scrollTop).toBe(600);
});

test("resetting an example keeps the focused choice below the sticky tabs in a short panel", () => {
  const area = boundedView(); area.style.paddingTop = "20px"; selectInterfaceTab("Example");
  const choice = sample().getByRole("button", { name: "An empty order, empty-order" });
  choice.getBoundingClientRect = () => new DOMRect(0, 440 - area.scrollTop, 100, 40);
  area.scrollTop = 800; act(() => choice.focus()); failureCase();
  expect(document.activeElement).toBe(choice);
  expect(choice.getBoundingClientRect().top).toBeGreaterThanOrEqual(60);
  expect(choice.getBoundingClientRect().bottom).toBeLessThanOrEqual(160);
  expect(sampleText()).toBe(failureExampleText);
});

test("ordinary focus reveals an earlier example choice below sticky tabs without selecting it", () => {
  const area = boundedView(); selectInterfaceTab("Example");
  const choice = sample().getByRole("button", { name: "An empty order, empty-order" });
  choice.getBoundingClientRect = () => new DOMRect(0, 270 - area.scrollTop, 100, 38);
  area.scrollTop = 260;
  act(() => choice.focus());
  expect(choice.getBoundingClientRect().top).toBeGreaterThanOrEqual(40);
  expect(choice.getBoundingClientRect().bottom).toBeLessThanOrEqual(160);
  expect(choice.getAttribute("aria-pressed")).toBe("false");
  expect(sampleText()).toBe("createInvoice(order)");
});

test("focus on a visible control does not move the current reading position", () => {
  const area = boundedView(); selectInterfaceTab("Example");
  const choice = sample().getByRole("button", { name: "A valid order, valid-order" });
  choice.getBoundingClientRect = () => new DOMRect(0, 340 - area.scrollTop, 100, 38);
  area.scrollTop = 260;
  act(() => choice.focus());
  expect(area.scrollTop).toBe(260);
});

test("focusing the tab body keeps its reading bookmark instead of jumping to its start", () => {
  const area = boundedView(); selectInterfaceTab("Example");
  const body = screen.getByRole("tabpanel", { name: "Example" });
  body.getBoundingClientRect = () => new DOMRect(0, 220 - area.scrollTop, 400, 1800);
  area.scrollTop = 600;
  act(() => body.focus());
  expect(area.scrollTop).toBe(600);
  act(() => screen.getByRole("tab", { name: "Sources" }).focus()); selectInterfaceTab("Sources");
  act(() => screen.getByRole("tab", { name: "Example" }).focus()); selectInterfaceTab("Example");
  expect(area.scrollTop).toBe(600);
});

test("an entry choice keeps Overview reading position while clearing the Example bookmark", () => {
  const area = boundedView(); selectInterfaceTab("Example");
  area.scrollTop = 600; selectInterfaceTab("Overview");
  area.scrollTop = 90;
  fireEvent.click(screen.getByRole("button", { name: "Invoice data, invoice-data" }));
  expect(area.scrollTop).toBe(90);
  selectInterfaceTab("Example");
  expect(area.scrollTop).toBe(0);
  expect(sampleText()).toBe('{"id":"saved-invoice"}\n');
});

test("copy feedback and source disclosure updates preserve the live reading position", async () => {
  const pending = Promise.withResolvers<void>(); clipboard(() => pending.promise);
  const area = boundedView(); selectInterfaceTab("Example");
  area.scrollTop = 600; copy();
  expect(area.scrollTop).toBe(600);
  area.scrollTop = 800;
  await act(async () => { pending.resolve(); await pending.promise; });
  expect(feedback()).toBe("Example copied."); expect(area.scrollTop).toBe(800);
  selectInterfaceTab("Sources"); area.scrollTop = 180;
  fireEvent.click(screen.getByText("Evidence references", { selector: "summary" }));
  expect(area.scrollTop).toBe(180);
  selectInterfaceTab("Example"); expect(area.scrollTop).toBe(800);
});
