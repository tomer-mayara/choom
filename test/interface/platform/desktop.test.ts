import { expect, expectTypeOf, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import * as desktop from "../../../src/platform/desktop";
import type { DesktopOperations } from "../../../src/platform/generated/contracts";

const schemas = new Ajv2020({ schemas: [contracts] });
const validateAvailability = schemas.compile({ $ref: "DesktopAvailability.json" });
const validateSelection = schemas.compile({ $ref: "DirectorySelection.json" });

type RuntimeOperations = {
  [Name in keyof typeof desktop]: (typeof desktop)[Name] extends (
    ...args: infer Parameters
  ) => infer Result
    ? (...args: Parameters) => Awaited<Result>
    : never;
};

test("desktop operation names, parameters, and results match TypeSpec", () => {
  expectTypeOf<RuntimeOperations>().toEqualTypeOf<DesktopOperations>();
  expectTypeOf<ReturnType<typeof desktop.isDesktop>>().toEqualTypeOf<boolean>();
  expectTypeOf<ReturnType<typeof desktop.selectProjectDirectory>>().toEqualTypeOf<
    Promise<ReturnType<DesktopOperations["selectProjectDirectory"]>>
  >();
});

test("browser adapter results satisfy the emitted operation result schemas", async () => {
  const availability = desktop.isDesktop();
  const selection = await desktop.selectProjectDirectory();

  expect(availability).toBe(false);
  expect(selection).toBeNull();
  expect(validateAvailability(availability)).toBe(true);
  expect(validateSelection(selection)).toBe(true);
});
