import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ArchitectureDetails } from "../../../src/components/architecture-details.tsx";
import { accepted, baselineExample, fixtureItem } from "../../support/baseline-fixtures.ts";
import { selectInterfaceTab } from "../../support/interface-details-dom.ts";
import { sourceUseReadingBaseline } from "../../support/source-use-reading-fixtures.ts";

afterEach(cleanup);
function view(variant = "complete") {
  const baseline = sourceUseReadingBaseline(variant);
  const mounted = render(<ArchitectureDetails baseline={baseline} panel={{ kind: "interface", interfaceId: "invoice-api" }} />);
  return { baseline, ...mounted };
}
const uses = () => screen.getByRole("region", { name: "Used by" });
function expand(name: string) { fireEvent.click(screen.getByText(name, { selector: "summary" })); }

test("Used by groups all primary sites and keeps permission separate", () => {
  view();
  const region = uses();
  expect(region.textContent).toContain("Interface-wide source use");
  expect(region.textContent).toContain("Checkout");
  expect(region.textContent).not.toContain("Admin");
  expect([...region.querySelectorAll("[data-consumer-group]")].map((group) => group.getAttribute("data-consumer-group"))).toEqual(["checkout", "billing"]);
  expect([...region.querySelectorAll("li[data-use-id]")].map((row) => row.getAttribute("data-use-id"))).toEqual(["checkout-invoice", "checkout-refund", "billing-tool"]);
  expect(region.querySelector('[data-use-id="billing-tool"]')?.textContent).toContain("Internal use");
  expand("Access rule");
  const access = screen.getByText("Access rule", { selector: "summary" }).closest("details");
  expect(access?.textContent).toContain("Admin");
  expect(access?.textContent).not.toContain("Checkout");
  expect(access?.textContent).toContain("Runtime execution is not recorded.");
});

test.each([
  ["no source object", "Source use not recorded."],
  ["no assessment", "Source use not assessed for this interface."],
  ["empty assessment", "No uses found in the reviewed scope."],
])("Used by distinguishes %s", (variant, message) => {
  view(variant);
  expect(uses().textContent).toContain(message);
  expect(uses().querySelectorAll("li[data-use-id]")).toHaveLength(0);
  if (variant === "empty assessment") {
    expect(uses().textContent).toContain("Reviewed the checkout caller and invoice declaration.");
    expect(uses().textContent).toContain("Other callers were not reviewed.");
  }
});

test("legacy interfaces do not turn permitted components into source uses", () => {
  render(<ArchitectureDetails baseline={baselineExample()} panel={{ kind: "interface", interfaceId: "invoice-api" }} />);
  expect(uses().textContent).toContain("Source use not recorded.");
  expect(uses().textContent).not.toContain("Checkout");
});

test("other references retain every record, kind, context, binding and exclusion reason", () => {
  const { baseline } = view();
  expand("Other source references (4)");
  const assessment = fixtureItem(baseline.sourceUsage.assessments);
  for (const use of assessment.uses) {
    const row = uses().querySelector(`li[data-use-id="${use.id}"]`);
    expect(row?.textContent).toContain(use.description);
    expect(row?.textContent?.toLowerCase()).toContain(use.kind);
    expect(row?.textContent?.toLowerCase()).toContain(use.context);
    expect(row?.textContent).toContain(use.accessPoint);
  }
  expect(uses().textContent).toContain("Type references stay in details.");
  expect(uses().textContent).toContain("Test references stay in details.");
  expect(uses().textContent).toContain("Context is unknown");
  expect(uses().textContent).toContain("Caller component is not mapped");
});

test("only excluded references keep their count and caller source reachable", () => {
  view("other references only");
  expect(uses().textContent).toContain("Other source references (2)");
  expect(uses().textContent).not.toContain("No uses found");
  expand("Other source references (2)");
  expect(uses().querySelectorAll("li[data-use-id]")).toHaveLength(2);
});

test("same-name consumers stay separate and known consumers survive an unknown provider", () => {
  const mounted = view("duplicate names");
  expect(uses().textContent).toContain("Checkout (checkout)");
  expect(uses().textContent).toContain("Checkout (second-checkout)");
  mounted.unmount();
  view("unknown provider");
  expect(uses().textContent).toContain("Checkout");
  expect(uses().textContent).toContain("Provider unknown");
  expect(uses().textContent).not.toContain("Internal use");
});

test("caller disclosure survives method and tab changes without filtering interface uses", () => {
  view();
  const first = uses().querySelector('li[data-use-id="checkout-invoice"]');
  if (!first) throw new Error("The first use must be present.");
  fireEvent.click(within(first as HTMLElement).getByText("Caller source", { selector: "summary" }));
  expect(first.textContent).toContain("checkout/order.ts");
  fireEvent.click(screen.getByRole("button", { name: "Refund invoice, refund-invoice" }));
  selectInterfaceTab("Sources"); selectInterfaceTab("Overview");
  const restored = uses().querySelector('li[data-use-id="checkout-invoice"] details');
  expect(restored?.hasAttribute("open")).toBe(true);
  expect(uses().querySelector('[data-use-id="checkout-refund"]')?.textContent).toContain("refundInvoice");
  expect(uses().querySelector('[data-use-id="checkout-invoice"]')?.textContent).toContain("createInvoice");
  expect(uses().querySelectorAll("a[href],iframe,script")).toHaveLength(0);
});

test("a missing entry binding does not imply all methods and statuses apply only to statements", () => {
  const baseline = sourceUseReadingBaseline();
  const item = fixtureItem(baseline.interfaces);
  item.owner = accepted("billing");
  const use = fixtureItem(fixtureItem(baseline.sourceUsage.assessments).uses);
  Reflect.deleteProperty(use, "entryId"); Reflect.deleteProperty(use, "accessPoint");
  render(<ArchitectureDetails baseline={baseline} panel={{ kind: "interface", interfaceId: item.id }} />);
  expect(screen.getByRole("group", { name: "Interface statement status" }).textContent).toContain("Mixed recorded statuses");
  expect(uses().querySelector('[data-use-id="checkout-invoice"]')?.textContent).toContain("Entry binding not recorded.");
  expect(uses().textContent).not.toContain("Accepted (recorded)");
});

test("accepted interface statements do not mark source uses accepted or executed", () => {
  view("accepted intent");
  const status = screen.getByRole("group", { name: "Interface statement status" });
  expect(status.textContent).toContain("Accepted (recorded)");
  expect(status.textContent).not.toContain("Mixed");
  expect(uses().textContent).toContain("Source review is partial.");
  expect(uses().textContent).toContain("Runtime execution is not recorded.");
  expect(uses().textContent).not.toContain("Accepted");
});
