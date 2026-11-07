import { expect, expectTypeOf, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import { architectureDocumentCodec } from "../../../src/lib/architecture-yaml.ts";
import type { ArchitectureDocumentCodec } from "../../../src/lib/generated/contracts.ts";
import { architectureDocumentFixture } from "../../support/document-fixtures.ts";

const schema = addFormats(new Ajv2020({ schemas: [contracts] }));

test("public codec operations conform to the generated contract", () => {
  const codec = architectureDocumentCodec;
  expectTypeOf(codec).toExtend<ArchitectureDocumentCodec>();
  const encoded = codec.encode(architectureDocumentFixture());
  expect(schema.compile({ $ref: "EncodeArchitectureOutcome.json" })(encoded)).toBe(true);
  if (encoded.status !== "success") throw new Error(encoded.message);
  const decoded = codec.decode(encoded.text);
  expect(schema.compile({ $ref: "DecodeArchitectureOutcome.json" })(decoded)).toBe(true);

  const failure = schema.compile({ $ref: "DocumentCodecFailure.json" });
  expect(failure(codec.encode({ schemaVersion: 2 }))).toBe(true);
  expect(failure(codec.decode("name: !tag Atlas\n"))).toBe(true);
});
