import { expect, expectTypeOf, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import contracts from "../../../../cookbook/interfaces/generated/contracts.schema.json";
import { DepCruiserReportConverter } from "../../../../src/architecture/dependency-cruiser/converter.ts";
import type { DepCruiserConversionOperations, DepCruiserConversionOutcome } from "../../../../src/architecture/dependency-cruiser/generated/contracts.ts";
import type { ReportConversion } from "../../../../src/architecture/dependency-cruiser/report-conversion.ts";
import { converterFixture, syncReport } from "../../../support/converter-fixtures.ts";

const ajv = addFormats(new Ajv2020({ schemas: [contracts] }));
const validateRequest = ajv.compile({ $ref: "DepCruiserConversionRequest.json" });
const validateOutcome = ajv.compile({ $ref: "DepCruiserConversionOutcome.json" });

test("the asynchronous converter binds the generated operation and validates both result forms", async () => {
  expectTypeOf<Parameters<ReportConversion["convert"]>>()
    .toEqualTypeOf<Parameters<DepCruiserConversionOperations["convert"]>>();
  expectTypeOf<ReturnType<ReportConversion["convert"]>>()
    .toEqualTypeOf<Promise<DepCruiserConversionOutcome>>();
  const fixture = converterFixture();
  expect(validateRequest(fixture.input)).toBe(true);
  const converter: ReportConversion = new DepCruiserReportConverter(fixture.repository);
  const success = await converter.convert(fixture.input);
  expect(success.status).toBe("success");
  expect(validateOutcome(success)).toBe(true);
  fixture.input.completed.json = "malformed";
  const failure = await converter.convert(fixture.input);
  expect(failure).toMatchObject({ status: "failure", code: "invalid-observations", stage: "conversion" });
  expect(validateOutcome(failure)).toBe(true);
});

test("a substitute converter can return a contract outcome", async () => {
  const { input } = converterFixture();
  const converter: ReportConversion = {
    convert: ({ completed }) => Promise.resolve({
      status: "failure",
      stage: "conversion",
      code: "unsupported",
      message: `The substitute cannot convert version ${completed.version}.`,
    }),
  };
  expect(validateOutcome(await converter.convert(input))).toBe(true);
});

test("unknown public context fields are rejected before path access", async () => {
  const fixture = converterFixture();
  const input = { ...fixture.input, command: "not-an-execution-interface" };
  expect(validateRequest(input)).toBe(false);
  const result = await new DepCruiserReportConverter({ resolveRepositoryPaths: async () => { throw new Error("must not access paths"); } }).convert(input);
  expect(result).toMatchObject({ status: "failure", code: "invalid-request" });
  expect(validateOutcome(result)).toBe(true);
});

test("the completed-report contract rejects unsupported version and invalid observation structures", async () => {
  const fixture = converterFixture();
  fixture.input.completed.version = "18.8.0";
  const converter = new DepCruiserReportConverter(fixture.repository);
  expect(await converter.convert(fixture.input)).toMatchObject({ status: "failure", code: "unsupported" });
  fixture.input.completed.version = "18.7.2";
  fixture.report.summary.violations = [{ type: "invented-vendor-type", from: "src/components/panel.ts", to: "packages/core/model/entity.ts", rule: { name: "rule", severity: "error" } }];
  syncReport(fixture);
  expect(await converter.convert(fixture.input)).toMatchObject({ status: "failure", code: "invalid-observations" });
});
