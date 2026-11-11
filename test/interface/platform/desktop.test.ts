import { expect, expectTypeOf, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import { isDesktop } from "../../../src/platform/desktop.ts";
import type { DesktopOperations } from "../../../src/platform/generated/contracts.ts";

test("browser host detection follows the retained native contract", () => {
  expectTypeOf<typeof isDesktop>().toEqualTypeOf<DesktopOperations["isDesktop"]>();
  const validate = new Ajv2020({ schemas: [contracts] }).compile({ $ref: "DesktopAvailability.json" });
  expect(isDesktop()).toBe(false);
  expect(validate(isDesktop())).toBe(true);
});
