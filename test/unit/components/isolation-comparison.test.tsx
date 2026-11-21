import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "../../../src/App.tsx";
import { boundaryFixture } from "../../support/boundary-baseline.ts";
import { selectedBaselineText } from "../../support/baseline-workflow-fixtures.ts";
import { comparisonWorkflow } from "../../support/comparison-workflow.ts";

afterEach(cleanup);

test("the file actions show both identities and the finding's checked sites in the selected scope", async () => {
  const { workflow } = comparisonWorkflow();
  await workflow.openBaseline();
  render(<App workspace={{ workflow }} />);
  fireEvent.click(screen.getByRole("button", { name: "Compare with earlier baseline" }));
  const pair = within(await screen.findByRole("region", { name: "Isolation comparison" }));
  expect(pair.getByText("Before → After")).toBeTruthy();
  const { current, comparison } = workflow.getSnapshot();
  if (!current || !comparison) throw new Error("Both input identities must be published");
  expect(pair.getByText(current.sha256)).toBeTruthy();
  expect(pair.getByText(comparison.before.sha256)).toBeTruthy();
  fireEvent.click(pair.getByRole("button", { name: /New violation.*Local Codex history.*GlobalConfigLoader/ }));
  expect(within(pair.getByRole("region", { name: "Before evidence" })).getByText(/Complete search/)).toBeTruthy();
  expect(pair.getByText(/Call · GlobalConfigLoader.load/)).toBeTruthy();
  expect(pair.queryByText(/in-memory adapter/i)).toBeNull();
  expect(pair.queryByText(/src\/history.ts/)).toBeNull();
  fireEvent.click(screen.getByRole("switch", { name: "Show non-production" }));
  expect(pair.getAllByText(/src\/history.ts/).length).toBeGreaterThan(0);
  expect(pair.getAllByText(/\.\/config\/loader/).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "Close comparison" }));
  await waitFor(() => expect(screen.queryByRole("region", { name: "Isolation comparison" }) === null).toBe(true));
  expect(screen.getByRole("switch", { name: "Show non-production" }).getAttribute("aria-checked")
    ?? (screen.getByRole("switch", { name: "Show non-production" }) as HTMLInputElement).checked).toBe(true);
});

test("failed Before or After replacement keeps the selected finding and scope; a successful replacement resets both", async () => {
  const { workflow, dependencies } = comparisonWorkflow();
  await workflow.openBaseline();
  await workflow.openComparison();
  render(<App workspace={{ workflow }} />);
  const panel = within(screen.getByRole("region", { name: "Isolation comparison" }));
  fireEvent.click(panel.getByRole("button", { name: /New violation/ }));
  fireEvent.click(screen.getByRole("switch", { name: "Show non-production" }));
  const otherProject = boundaryFixture();
  otherProject.boundaryReview.identity.projectKey = "Other project";
  dependencies.selectEarlierBaseline = async () => selectedBaselineText(JSON.stringify(otherProject));
  fireEvent.click(screen.getByRole("button", { name: "Compare with earlier baseline" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Project mismatch");
  expect(panel.getByRole("button", { name: /New violation/ }).getAttribute("aria-expanded")).toBe("true");
  const selectValid = dependencies.selectBaseline;
  dependencies.selectBaseline = async () => selectedBaselineText("invalid: [");
  fireEvent.click(screen.getByRole("button", { name: "Open Baseline" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("baseline validation failed"));
  expect((screen.getByRole("switch") as HTMLInputElement).checked).toBe(true);
  expect(panel.getByRole("button", { name: /New violation/ }).getAttribute("aria-expanded")).toBe("true");
  dependencies.selectBaseline = selectValid;
  fireEvent.click(screen.getByRole("button", { name: "Open Baseline" }));
  await waitFor(() => expect(screen.queryByRole("region", { name: "Isolation comparison" }) === null).toBe(true));
  expect((screen.getByRole("switch") as HTMLInputElement).checked).toBe(false);
});
