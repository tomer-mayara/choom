import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InterfaceSources } from "../../../src/components/interface-sources.tsx";
import { useInterfaceDisclosures } from "../../../src/components/use-interface-disclosures.ts";
import type { Baseline } from "../../../src/domain/generated/contracts.ts";
import { baselineCodec } from "../../../src/lib/baseline-yaml.ts";
import { fixtureItem } from "../../support/baseline-fixtures.ts";
import { sourceUsageBaseline } from "../../support/source-usage-fixtures.ts";

afterEach(cleanup);

function CapacitySources({ baseline }: { baseline: Baseline }) {
  const disclosure = useInterfaceDisclosures();
  const assessment = baseline.formatVersion === 3 ? baseline.sourceUsage?.assessments[0] : undefined;
  return <InterfaceSources baseline={baseline} item={fixtureItem(baseline.interfaces)} assessment={assessment} disclosure={disclosure} />;
}

test("a valid maximum use count with shared support does not eagerly mount every citation", () => {
  const input = sourceUsageBaseline();
  const assessment = fixtureItem(input.sourceUsage.assessments);
  const note = fixtureItem(assessment.sourceNotes);
  const original = fixtureItem(assessment.uses);
  const references = Array.from({ length: 100 }, (_, index) => `r${index}`);
  assessment.sourceNotes = references.map((evidenceRef) => ({ ...structuredClone(note), evidenceRef }));
  assessment.evidenceRefs = references;
  assessment.uses = Array.from({ length: 2000 }, (_, index) => ({
    ...structuredClone(original), id: `u${index}`, callerRef: fixtureItem(references), evidenceRefs: references,
  }));
  expect(new TextEncoder().encode(JSON.stringify(input.sourceUsage)).byteLength).toBeLessThan(2 * 1024 * 1024);
  const decoded = baselineCodec.decode(JSON.stringify(input));
  expect(decoded.status).toBe("success");
  if (decoded.status !== "success") throw new Error(decoded.message);
  const mounted = render(<CapacitySources baseline={decoded.baseline} />);
  expect(screen.queryAllByText("u1999", { exact: true })).toHaveLength(0);
  expect(screen.getAllByText("Source uses (2000)", { exact: true })).toHaveLength(100);
  fireEvent.click(screen.getByText("Evidence references", { selector: "summary" }));
  expect(screen.getAllByText("Source uses (2000)", { exact: true })).toHaveLength(200);
  expect(mounted.container.querySelectorAll("li").length).toBeLessThan(300);
  fireEvent.click(fixtureItem(screen.getAllByText("Source uses (2000)", { exact: true })));
  expect(screen.getAllByText("u1999", { exact: true })).toHaveLength(1);
  expect(mounted.container.querySelectorAll("li").length).toBeLessThan(2300);
}, 15_000);
