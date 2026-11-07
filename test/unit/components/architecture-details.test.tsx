import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ArchitectureDetails } from "../../../src/components/architecture-details.tsx";
import { architectureDocumentFixture } from "../../support/document-fixtures.ts";

afterEach(cleanup);

test("the document details retain counts, parent declarations, and recorded analysis scope", () => {
  const document = architectureDocumentFixture();
  document.analysis.scopeNotes = ["Tests are outside the analysis inputs.", "Only reported files are counted."];
  render(<ArchitectureDetails document={document} />);

  const components = screen.getByRole("table", { name: "Declared components" });
  expect(within(components).getAllByRole("row")).toHaveLength(4);
  expect(within(components).getByRole("row", { name: /Workspace src .* 3 files reported/ }).textContent).toContain(".");
  expect(within(components).getByText("No files reported")).toBeTruthy();
  const provenance = screen.getByRole("region", { name: "Recorded analysis" });
  expect(provenance.textContent).toContain(`${document.analysis.enforcer} ${document.analysis.version}`);
  expect(provenance.textContent).toContain(document.analysis.config);
  for (const note of document.analysis.scopeNotes) expect(provenance.textContent).toContain(note);
});

test("relationship details display each file pair and its distinct reported and unknown flags", () => {
  const document = architectureDocumentFixture();
  document.relationships[0]?.evidence[0]?.variants.push({ typeOnly: true }, { typeOnly: false });
  render(<ArchitectureDetails document={document} />);

  const imports = screen.getByRole("region", { name: "Imports" });
  expect(imports.textContent).toContain("2 file pairs");
  expect(within(imports).getByText("src/components/panel.ts")).toBeTruthy();
  expect(within(imports).getByText("src/lib/format.ts")).toBeTruthy();
  expect(within(imports).getAllByText("packages/core/model/entity.ts")).toHaveLength(2);
  expect(imports.textContent).toContain("Type only: Unknown");
  expect(imports.textContent).toContain("Type only: Yes");
  expect(imports.textContent).toContain("Type only: No");
});

test("findings expose subject roles, ordered paths, metrics, and escaped messages", () => {
  const document = architectureDocumentFixture();
  const finding = document.diagnostics[0];
  if (!finding) throw new Error("The fixture must include a finding.");
  finding.message = "<img src=x onerror=alert(1)> is reported text";
  const { container } = render(<ArchitectureDetails document={document} />);
  const findings = screen.getByRole("region", { name: "Findings" });

  expect(findings.textContent).toContain("Source folder: src/components");
  expect(findings.textContent).toContain("Target folder: packages/core/model");
  const cycle = within(findings).getByRole("list", { name: "Cycle" });
  expect(within(cycle).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
    "folder: src/components", "folder: packages/core/model", "folder: src/components",
  ]);
  expect(findings.textContent).toContain("__proto__");
  expect(findings.textContent).toContain("<img src=x onerror=alert(1)>");
  expect(container.querySelector("img")).toBeNull();
});
