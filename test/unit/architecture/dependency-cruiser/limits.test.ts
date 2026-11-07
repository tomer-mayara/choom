import { expect, test } from "bun:test";
import { DepCruiserReportConverter } from "../../../../src/architecture/dependency-cruiser/converter.ts";
import { converterFixture, syncReport } from "../../../support/converter-fixtures.ts";

test.each(["modules", "dependencies", "findings", "ordered references", "folders", "rules", "text"])("%s above the conversion limit fail before native access", async (limit) => {
  const fixture = converterFixture();
  const source = fixture.report.modules[0];
  const dependency = source?.dependencies[0];
  if (!source || !dependency) throw new Error("The fixture must contain a reported import.");
  const finding = { type: "dependency", from: source.source, to: dependency.resolved, rule: { name: "rule", severity: "error" } };
  switch (limit) {
    case "modules": fixture.report.modules = Array.from({ length: 10_001 }, () => ({ source: source.source, dependencies: [] })); break;
    case "dependencies": source.dependencies = Array.from({ length: 50_001 }, () => dependency); break;
    case "findings": fixture.report.summary.violations = Array.from({ length: 5_001 }, () => finding); break;
    case "ordered references": fixture.report.summary.violations = [{ ...finding, via: Array.from({ length: 50_001 }, () => ({ name: source.source })) }]; break;
    case "folders": fixture.report.folders = Array.from({ length: 10_001 }, () => ({ name: "src", moduleCount: 1 })); break;
    case "rules": fixture.report.summary.ruleSetUsed = { forbidden: Array.from({ length: 5_001 }, () => ({ name: "rule" })) }; break;
  }
  syncReport(fixture);
  if (limit === "text") fixture.input.completed.json = " ".repeat(16 * 1024 * 1024 + 1);
  let accessed = false;
  const result = await new DepCruiserReportConverter({ resolveRepositoryPaths: async (request) => { accessed = true; return fixture.repository.resolveRepositoryPaths(request); } }).convert(fixture.input);
  expect(result).toMatchObject({ status: "failure", code: "limit-exceeded" });
  expect(accessed).toBe(false);
});

test("the module boundary is accepted and native path batches stay within its contract", async () => {
  const fixture = converterFixture();
  fixture.report.modules = Array.from({ length: 10_000 }, (_, index) => {
    const source = `src/file-${index}.ts`;
    fixture.repository.addFile(source);
    return { source, dependencies: [] };
  });
  syncReport(fixture);
  let largestBatch = 0;
  const result = await new DepCruiserReportConverter({ resolveRepositoryPaths: async (request) => {
    largestBatch = Math.max(largestBatch, request.paths.length);
    if (request.paths.length > 128) return { status: "failure", code: "limit-exceeded", message: "Native batch exceeds 128 paths." };
    return fixture.repository.resolveRepositoryPaths(request);
  } }).convert(fixture.input);
  expect(result.status).toBe("success");
  expect(largestBatch).toBeLessThanOrEqual(128);
  if (result.status !== "success") return;
  expect(result.document.components.find(({ id }) => id === "src")?.reportedFiles).toBe(10_000);
});

test("the dependency boundary aggregates repeated evidence without accumulating classification tags", async () => {
  const fixture = converterFixture();
  const source = fixture.report.modules[0];
  const dependency = source?.dependencies[0];
  if (!source || !dependency) throw new Error("The fixture must have an import.");
  source.dependencies = Array.from({ length: 50_000 }, () => dependency);
  syncReport(fixture);
  const result = await new DepCruiserReportConverter(fixture.repository).convert(fixture.input);
  expect(result.status).toBe("success");
  if (result.status !== "success") return;
  expect(result.document.relationships[0]?.evidence).toEqual([{ sourceFile: source.source, targetFile: dependency.resolved, variants: [{ dynamic: false }] }]);
});
