import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ArchitectureDetails } from "../../../src/components/architecture-details.tsx";
import { architectureDocumentFixture } from "../../support/document-fixtures.ts";

afterEach(cleanup);

test("component details retain the selected declaration and its reported count", () => {
  const document = architectureDocumentFixture();
  render(<ArchitectureDetails document={document} panel={{ kind: "component", componentId: "src" }} />);

  const component = screen.getByRole("region", { name: "Declared components" });
  expect(component.textContent).toContain("Workspace");
  expect(component.textContent).toContain("src");
  expect(component.textContent).toContain("Parent");
  expect(component.textContent).toContain(".");
  expect(component.textContent).toContain("3 files reported");
  expect(component.textContent).not.toContain("Core");
  expect(screen.queryByRole("region", { name: "Recorded analysis" }) === null).toBe(true);
});

test("recorded analysis retains provenance and scope without unrelated component details", () => {
  const document = architectureDocumentFixture();
  document.analysis.scopeNotes = ["Tests are outside the analysis inputs.", "Only reported files are counted."];
  render(<ArchitectureDetails document={document} panel={{ kind: "analysis" }} />);

  const provenance = screen.getByRole("region", { name: "Recorded analysis" });
  expect(provenance.textContent).toContain(`${document.analysis.enforcer} ${document.analysis.version}`);
  expect(provenance.textContent).toContain(document.analysis.config);
  for (const note of document.analysis.scopeNotes) expect(provenance.textContent).toContain(note);
  expect(screen.queryByRole("region", { name: "Declared components" }) === null).toBe(true);
});

test("relationship details display each file pair and its distinct reported and unknown flags", () => {
  const document = architectureDocumentFixture();
  document.relationships[0]?.evidence[0]?.variants.push({ typeOnly: true }, { typeOnly: false });
  render(<ArchitectureDetails document={document} panel={{ kind: "component", componentId: "src" }} />);

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
  const { container } = render(<ArchitectureDetails document={document} panel={{ kind: "findings" }} />);
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

test("component imports include incoming and outgoing relationships but exclude unrelated imports", () => {
  const document = architectureDocumentFixture();
  document.relationships.push({
    id: "imports:core:src", kind: "imports", source: "packages/core", target: "src",
    evidence: [{ sourceFile: "packages/core/incoming.ts", targetFile: "src/main.ts", variants: [{}] }],
  }, {
    id: "imports:root:core", kind: "imports", source: ".", target: "packages/core",
    evidence: [{ sourceFile: "unrelated.ts", targetFile: "packages/core/main.ts", variants: [{}] }],
  });
  render(<ArchitectureDetails document={document} panel={{ kind: "component", componentId: "src" }} />);

  const imports = screen.getByRole("region", { name: "Imports" });
  expect(imports.textContent).toContain("src/components/panel.ts");
  expect(imports.textContent).toContain("packages/core/incoming.ts");
  expect(imports.textContent).toContain("Imports from");
  expect(imports.textContent).toContain("Imported by");
  expect(imports.textContent).not.toContain("unrelated.ts");
});

test("an isolated component retains zero files and its declared children", () => {
  render(<ArchitectureDetails document={architectureDocumentFixture()} panel={{ kind: "component", componentId: "." }} />);
  const declaration = screen.getByRole("region", { name: "Declared components" });
  expect(declaration.textContent).toContain("No files reported");
  expect(declaration.textContent).toContain("Core");
  expect(declaration.textContent).toContain("Workspace");
  expect(screen.getByRole("region", { name: "Imports" }).textContent).toContain("No imports involving this component were reported.");
});
