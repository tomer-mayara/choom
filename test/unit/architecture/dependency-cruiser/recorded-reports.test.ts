import { expect, test } from "bun:test";
import { DepCruiserReportConverter } from "../../../../src/architecture/dependency-cruiser/converter.ts";
import complete from "../../../fixtures/dependency-cruiser/18.7.2/complete.json";
import missingSwc from "../../../fixtures/dependency-cruiser/18.7.2/missing-swc.json";
import recording from "../../../fixtures/dependency-cruiser/18.7.2/recording.json";
import sources from "../../../fixtures/dependency-cruiser/18.7.2/sources.json";
import { converterFixture } from "../../../support/converter-fixtures.ts";

test("the pinned real CLI report preserves findings, flags, aliases, and component ownership", async () => {
  const fixture = converterFixture();
  for (const [file, text] of Object.entries(sources.files)) fixture.repository.addFile(file, text);
  for (const [alias, target] of Object.entries(sources.symlinks)) fixture.repository.aliases.set(alias, target);
  fixture.input.completed.json = JSON.stringify(complete);
  fixture.input.request.analysis.inputs = ["src"];
  const result = await new DepCruiserReportConverter(fixture.repository).convert(fixture.input);
  expect(result.status).toBe("success");
  if (result.status !== "success") return;
  expect(result.document.components.map(({ id, reportedFiles }) => ({ id, reportedFiles }))).toEqual([
    { id: ".", reportedFiles: 0 }, { id: "packages/core", reportedFiles: 1 }, { id: "src", reportedFiles: 7 },
  ]);
  expect(result.document.relationships).toHaveLength(1);
  expect(result.document.relationships[0]?.evidence).toHaveLength(2);
  expect(result.document.relationships[0]?.evidence[0]?.variants).toContainEqual({ dynamic: false, typeOnly: true, preCompilationOnly: true });
  expect(new Set(result.document.diagnostics.map(({ code }) => code))).toEqual(new Set(["cycle", "dependency", "folder", "folder-instability", "module", "reachability", "unresolved-import"]));
  expect(result.document.diagnostics.some(({ subjects }) => subjects.some(({ kind, value }) => kind === "builtin" && value === "fs"))).toBe(true);
  expect(result.document.diagnostics.find(({ code }) => code === "reachability")?.via?.map(({ value }) => value)).toEqual(["src/core/a.ts", "src/core/b.ts", "src/core/c.ts"]);
  expect(result.document.analysis.scopeNotes).toContain('exclude: {"path":"src/legacy"}');
  expect(JSON.stringify(result.document)).not.toContain("core-link");
  expect(JSON.stringify(result.document)).not.toContain("/private/tmp");
});

test("a real zero-exit report with missing SWC is not a successful architecture", async () => {
  const fixture = converterFixture();
  fixture.input.completed.json = JSON.stringify(missingSwc);
  const result = await new DepCruiserReportConverter(fixture.repository).convert(fixture.input);
  expect(recording.reports[1]?.exitCode).toBe(0);
  expect(recording.reports[1]?.stderr).toBe("");
  expect(result).toMatchObject({ status: "failure", code: "unavailable", message: expect.stringContaining("swc") });
});
