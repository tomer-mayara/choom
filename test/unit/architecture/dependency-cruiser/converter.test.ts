import { expect, test } from "bun:test";
import { DepCruiserReportConverter } from "../../../../src/architecture/dependency-cruiser/converter.ts";
import { converterFixture, syncReport } from "../../../support/converter-fixtures.ts";

test("declared components own multiple source directories and followed imports", async () => {
  const fixture = converterFixture();
  fixture.report.modules.push({ source: "src/lib/format.ts", dependencies: [{ module: "@core/model/entity", resolved: "packages/core/model/entity.ts", dependencyTypes: ["npm"] }] });
  syncReport(fixture);
  const result = await new DepCruiserReportConverter(fixture.repository).convert(fixture.input);
  expect(result.status).toBe("success");
  if (result.status !== "success") return;
  expect(result.document.name).toBe("Atlas");
  expect(result.document.components).toEqual([
    { id: ".", name: "Atlas", reportedFiles: 0 },
    { id: "packages/core", name: "core", parent: ".", reportedFiles: 1 },
    { id: "src", name: "workspace", parent: ".", reportedFiles: 2 },
  ]);
  expect(result.document.relationships).toHaveLength(1);
  expect(result.document.relationships[0]?.evidence).toHaveLength(2);
  expect(result.document.analysis.inputs).toEqual(["src/components", "src/lib"]);
  expect(fixture.repository.activeSessions.has("repository-1")).toBe(true);
});

test("canonical aliases count reference-only files once and preserve unknown and mixed flags", async () => {
  const fixture = converterFixture();
  fixture.repository.aliases.set("linked-core", "packages/core");
  fixture.report.modules.push({ source: "linked-core/model/entity.ts", dependencies: [], followable: false });
  const source = fixture.report.modules[0];
  if (!source) throw new Error("The fixture must have a source module.");
  source.dependencies.push(
    { module: "linked-core/model/entity", resolved: "linked-core/model/entity.ts", dependencyTypes: ["npm", "type-only", "pre-compilation-only"] },
    { module: "@core/model/entity", resolved: "packages/core/model/entity.ts", dependencyTypes: ["local"], dynamic: true, typeOnly: false },
  );
  syncReport(fixture);
  const result = await new DepCruiserReportConverter(fixture.repository).convert(fixture.input);
  expect(result.status).toBe("success");
  if (result.status !== "success") return;
  expect(result.document.components.find(({ id }) => id === "packages/core")?.reportedFiles).toBe(1);
  expect(result.document.relationships[0]?.evidence).toEqual([{
    sourceFile: "src/components/panel.ts", targetFile: "packages/core/model/entity.ts",
    variants: expect.arrayContaining([{ dynamic: false }, { typeOnly: true, preCompilationOnly: true }, { typeOnly: false, dynamic: true }]),
  }]);
});

test.each(["collapse", "focus", "reaches"])("effective %s changes graph semantics", async (option) => {
  const fixture = converterFixture();
  fixture.report.summary.optionsUsed[option] = "src";
  syncReport(fixture);
  expect(await new DepCruiserReportConverter(fixture.repository).convert(fixture.input)).toMatchObject({ status: "failure", code: "unsupported" });
});

test("required transpiler absence fails even when JSON exists", async () => {
  const fixture = converterFixture();
  fixture.report.summary.environment.issues = [{ name: "missing-swc-transpiler", severity: "warn", description: "missing compiler" }];
  syncReport(fixture);
  expect(await new DepCruiserReportConverter(fixture.repository).convert(fixture.input)).toMatchObject({ status: "failure", code: "unavailable", message: expect.stringContaining("swc") });
});

test("native missing paths do not create partial success", async () => {
  const fixture = converterFixture();
  fixture.repository.files.delete("src/components/panel.ts");
  expect(await new DepCruiserReportConverter(fixture.repository).convert(fixture.input)).toMatchObject({ status: "failure", code: "source-changed", message: expect.stringContaining("src/components/panel.ts") });
});

test("ambiguous finding scopes and contradictory import flags fail deliberately", async () => {
  const fixture = converterFixture();
  fixture.report.summary.violations.push({ type: "cycle", from: "src/components/panel.ts", to: "packages/core/model/entity.ts", rule: { name: "cycle", severity: "error" } });
  syncReport(fixture);
  expect(await new DepCruiserReportConverter(fixture.repository).convert(fixture.input)).toMatchObject({ status: "failure", code: "invalid-observations" });
  fixture.report.summary.violations = [];
  const dependency = fixture.report.modules[0]?.dependencies[0];
  if (!dependency) throw new Error("The fixture must have an import.");
  dependency.typeOnly = false;
  dependency.dependencyTypes.push("type-only");
  syncReport(fixture);
  expect(await new DepCruiserReportConverter(fixture.repository).convert(fixture.input)).toMatchObject({ status: "failure", code: "invalid-observations" });
});

test("a folder sink can identify a root-level file without inventing a directory", async () => {
  const fixture = converterFixture();
  fixture.repository.addFile("a.js");
  fixture.repository.addFile("b.js");
  fixture.report.modules = [{ source: "a.js", dependencies: [{ module: "./b.js", resolved: "b.js", dependencyTypes: ["local"] }] }, { source: "b.js", dependencies: [] }];
  fixture.report.folders = [{ name: ".", moduleCount: 2 }, { name: "b.js", moduleCount: -1 }];
  fixture.report.summary.violations = [{ type: "folder", from: ".", to: "b.js", rule: { name: "root-folder-rule", severity: "warn" } }];
  syncReport(fixture);
  const result = await new DepCruiserReportConverter(fixture.repository).convert(fixture.input);
  expect(result.status).toBe("success");
  if (result.status !== "success") return;
  expect(result.document.components.find(({ id }) => id === ".")?.reportedFiles).toBe(2);
  expect(result.document.diagnostics[0]?.subjects).toContainEqual({ role: "target", kind: "file", value: "b.js" });
});

test.each(["`/Users/tom/private.ts`", "`C:\\Users\\tom\\private.ts`", "`\\\\server\\private\\code.ts`", "file:///Users/tom/private.ts", "https://secret.example/source.ts"])("analyzer warnings redact host reference %s", async (reference) => {
  const fixture = converterFixture();
  fixture.report.summary.environment.issues = [{ name: "notice", severity: "warn", description: `Could not inspect ${reference}\nwhile checking imports.` }];
  syncReport(fixture);
  const result = await new DepCruiserReportConverter(fixture.repository).convert(fixture.input);
  expect(result.status).toBe("success");
  if (result.status !== "success") return;
  const message = result.document.diagnostics[0]?.message;
  expect(message).toContain("while checking imports.");
  expect(message).not.toContain("private");
  expect(message).not.toContain("secret.example");
  expect(message).not.toContain("\n");
});

test("scope filters do not export arbitrary configuration fields", async () => {
  const fixture = converterFixture();
  fixture.report.summary.optionsUsed.exclude = { path: "legacy", rawSource: "const secret = 'private';" };
  syncReport(fixture);
  const result = await new DepCruiserReportConverter(fixture.repository).convert(fixture.input);
  expect(result.status).toBe("success");
  if (result.status !== "success") return;
  expect(result.document.analysis.scopeNotes).toContain('exclude: {"path":"legacy"}');
  expect(JSON.stringify(result.document)).not.toContain("private");
});

test("finite metric names retain own reserved properties", async () => {
  const fixture = converterFixture();
  fixture.report.summary.violations = [{ type: "dependency", from: "src/components/panel.ts", to: "packages/core/model/entity.ts", rule: { name: "metrics", severity: "info" }, metrics: { from: Object.fromEntries([["__proto__", 0.5], ["constructor", 1]]) } }];
  syncReport(fixture);
  const result = await new DepCruiserReportConverter(fixture.repository).convert(fixture.input);
  expect(result.status).toBe("success");
  if (result.status !== "success") return;
  expect(result.document.diagnostics[0]?.metrics).toEqual({ "source.__proto__": 0.5, "source.constructor": 1 });
});
