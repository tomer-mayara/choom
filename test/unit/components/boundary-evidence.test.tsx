import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { LoadWorkflow } from "../../../src/architecture/load-workflow.ts";
import App from "../../../src/App.tsx";
import { boundaryBytes } from "../../support/boundary-baseline.ts";
import { baselineWorkflowDependencies, selectedBaselineText } from "../../support/baseline-workflow-fixtures.ts";
import { discoveryFixture } from "../../support/discovery-fixtures.ts";

afterEach(cleanup);

test("the opted-in Evidence panel connects the walkthrough, question and linked answer to the selected component", async () => {
  const dependencies = baselineWorkflowDependencies();
  dependencies.selectBaseline = async () => selectedBaselineText(boundaryBytes("after"));
  const workflow = new LoadWorkflow(dependencies);
  await workflow.openBaseline();
  const current = workflow.getSnapshot().current;
  if (!current) throw new Error("Missing published baseline");
  const discovery = {
    ...discoveryFixture().result, baselineRef: current.baseline.id, baselineDigest: current.sha256,
    inspectedPaths: [{ componentIds: ["configuration"], description: "Read the loading path.", steps: [{ action: "Load the file." }] }],
    questions: [
      { id: "ask-owner", subjectRefs: ["configuration"], text: "Which owner supplies the file?", evidenceRefs: ["question-note"] },
      { id: "reply", subjectRefs: ["ask-owner"], text: "The fixture supplies this file.", evidenceRefs: ["fixture-answer"] },
    ], gaps: [],
  };
  dependencies.selectDiscoveryResult = async () => selectedBaselineText(JSON.stringify(discovery));
  expect((await workflow.openDiscoveryResult()).status).toBe("success");
  render(<App workspace={{ workflow }} />);
  fireEvent.click(screen.getByRole("button", { name: "Configuration, Production" }));
  expect(screen.getByRole("dialog").textContent).not.toContain("The fixture supplies this file.");
  fireEvent.click(screen.getByRole("switch", { name: "Show non-production" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByText("Evidence", { selector: "summary" }));
  expect(within(screen.getByRole("region", { name: "Walkthrough" })).getByText("Load the file.")).toBeTruthy();
  const answers = screen.getByRole("region", { name: "Linked answers" });
  expect(answers.textContent).toContain("The fixture supplies this file.");
  expect(answers.textContent).toContain("ask-owner");
  expect(answers.textContent).toContain("fixture-answer");
  fireEvent.click(screen.getByRole("switch", { name: "Show non-production" }));
  expect(screen.getByRole("dialog").textContent).not.toContain("The fixture supplies this file.");
});
