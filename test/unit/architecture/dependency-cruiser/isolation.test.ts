import { expect, test } from "bun:test";
import { DepCruiserReportConverter } from "../../../../src/architecture/dependency-cruiser/converter.ts";
import type { RepositoryFailureCode } from "../../../../src/platform/generated/contracts.ts";
import { converterFixture, syncReport } from "../../../support/converter-fixtures.ts";

test("reordered observations and repeated or concurrent calls produce the same document", async () => {
  const fixture = converterFixture();
  const source = fixture.report.modules[0];
  if (!source) throw new Error("The fixture must have a source module.");
  source.dependencies.push({ module: "@core/model/entity", resolved: "packages/core/model/entity.ts", dependencyTypes: ["local"], typeOnly: true });
  fixture.report.summary.violations = [{ type: "dependency", from: "src/components/panel.ts", to: "packages/core/model/entity.ts", rule: { name: "dependency-rule", severity: "warn" } }];
  syncReport(fixture);
  const converter = new DepCruiserReportConverter(fixture.repository);
  const original = structuredClone(fixture.input);
  const first = await converter.convert(original);
  fixture.report.modules.reverse();
  for (const module of fixture.report.modules) module.dependencies.reverse();
  fixture.report.summary.violations.reverse();
  fixture.input.request.components.reverse();
  fixture.input.request.analysis.inputs.reverse();
  syncReport(fixture);
  const reordered = structuredClone(fixture.input);
  const [second, third] = await Promise.all([converter.convert(reordered), converter.convert(original)]);
  expect(first.status).toBe("success");
  expect(second).toEqual(first);
  expect(third).toEqual(first);
  expect(fixture.input).toEqual(reordered);
  expect(fixture.repository.activeSessions.has("repository-1")).toBe(true);
});

test.each([
  ["limit-exceeded", "limit-exceeded"], ["invalid-session", "unavailable"],
  ["io-error", "unavailable"], ["invalid-response", "unavailable"],
  ["unavailable", "unavailable"],
] as const)("native %s stays a failure without exposing its message", async (nativeCode, expectedCode) => {
  const fixture = converterFixture();
  const code: RepositoryFailureCode = nativeCode;
  const result = await new DepCruiserReportConverter({ resolveRepositoryPaths: async () => ({ status: "failure", code, message: "private /Users/tom/repository/source.ts" }) }).convert(fixture.input);
  expect(result).toMatchObject({ status: "failure", code: expectedCode });
  expect(JSON.stringify(result)).not.toContain("private");
  expect(JSON.stringify(result)).not.toContain("/Users");
});

test("a missing absolute host path cannot appear in the source-change message", async () => {
  const fixture = converterFixture();
  fixture.report.modules = [{ source: "/repository/private/source.ts", dependencies: [] }];
  syncReport(fixture);
  const result = await new DepCruiserReportConverter(fixture.repository).convert(fixture.input);
  expect(result).toMatchObject({ status: "failure", code: "source-changed" });
  expect(JSON.stringify(result)).not.toContain("/repository");
  expect(JSON.stringify(result)).not.toContain("private");
});

test("a dependency with no target inventory does not invent a reported file", async () => {
  const fixture = converterFixture();
  fixture.report.modules = fixture.report.modules.slice(0, 1);
  syncReport(fixture);
  expect(await new DepCruiserReportConverter(fixture.repository).convert(fixture.input)).toMatchObject({ status: "failure", code: "invalid-observations" });
});

test("closed or malformed context is rejected without borrowing another session", async () => {
  const fixture = converterFixture();
  fixture.input.request.repositorySession = "repository-18446744073709551616";
  expect(await new DepCruiserReportConverter(fixture.repository).convert(fixture.input)).toMatchObject({ status: "failure", code: "invalid-request" });
  fixture.input.request.repositorySession = "repository-2";
  expect(await new DepCruiserReportConverter(fixture.repository).convert(fixture.input)).toMatchObject({ status: "failure", code: "unavailable" });
  expect([...fixture.repository.activeSessions]).toEqual(["repository-1"]);
});
