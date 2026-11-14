import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { ArchitectureDiagram } from "../../../src/components/architecture-diagram.tsx";
import { baselineExample, fixtureItem } from "../../support/baseline-fixtures.ts";
import { sourceUseReadingBaseline } from "../../support/source-use-reading-fixtures.ts";

afterEach(cleanup);

test.each([
  ["no source object", "Source use not recorded."],
  ["no assessment", "No interface source assessments recorded."],
  ["unknown policies", "Source review is partial. See interface details for scope and gaps."],
])("the source notice explains %s without counting permission gaps", (variant, message) => {
  render(<ArchitectureDiagram baseline={sourceUseReadingBaseline(variant)} layout={{ nodes: [] }} />);
  expect(screen.getByText(message).textContent).toBe(message);
  expect(screen.queryAllByText(/unknown owners or allowed consumers/)).toHaveLength(0);
});

test("a baseline with no interfaces has no source notice", () => {
  const baseline = sourceUseReadingBaseline();
  baseline.interfaces = [];
  baseline.sourceUsage.assessments = [];
  render(<ArchitectureDiagram baseline={baseline} layout={{ nodes: [] }} />);
  expect(screen.queryAllByText(/Source use not recorded|No interface source assessments|Source review is partial/)).toHaveLength(0);
});

test("legacy baselines retain their policy notice", () => {
  const baseline = baselineExample();
  fixtureItem(baseline.interfaces).allowedConsumers.value = null;
  render(<ArchitectureDiagram baseline={baseline} layout={{ nodes: [] }} />);
  expect(screen.getByText(/unknown owners or allowed consumers/).textContent).toContain("1 interface has");
  expect(screen.queryAllByText(/Source review is partial/)).toHaveLength(0);
});
