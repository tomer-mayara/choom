import { stringify } from "yaml";
import { architectureDocumentSchema } from "../domain/architecture-document.ts";
import type { ArchitectureDocument } from "../domain/generated/contracts.ts";
import { assertBoundedJsonData } from "./architecture-yaml/json-data.ts";
import { checkYamlTokenLimits } from "./architecture-yaml/lex.ts";
import { CodecProblem, utf8Bytes } from "./architecture-yaml/limits.ts";
import { readYamlData } from "./architecture-yaml/parse.ts";
import type {
  ArchitectureDocumentCodec, DecodeArchitectureOutcome, DocumentCodecFailure, EncodeArchitectureOutcome,
} from "./generated/contracts.ts";

function checkedDocument(value: unknown): ArchitectureDocument {
  const version: unknown = typeof value === "object" && value !== null
    ? Object.getOwnPropertyDescriptor(value, "schemaVersion")?.value : undefined;
  if (typeof version === "number" && version !== 1) {
    throw new CodecProblem("unsupported-version", "The architecture document schema version is unsupported.");
  }
  const result = architectureDocumentSchema.safeParse(value);
  if (!result.success) {
    throw new CodecProblem("invalid-document", "The architecture document does not match the schema.");
  }
  return result.data;
}

function failure(stage: DocumentCodecFailure["stage"], start: number, error: unknown): DocumentCodecFailure {
  const problem = error instanceof CodecProblem
    ? error
    : new CodecProblem("invalid-encoding", "The architecture document could not be processed as YAML.");
  return { status: "failure", stage, code: problem.code, message: problem.message, durationMs: performance.now() - start };
}

export function encodeArchitectureYaml(document: unknown): EncodeArchitectureOutcome {
  const start = performance.now();
  try {
    assertBoundedJsonData(document);
    const text = stringify(checkedDocument(document), { aliasDuplicateObjects: false });
    utf8Bytes(text);
    checkYamlTokenLimits(text);
    return { status: "success", text, durationMs: performance.now() - start };
  } catch (error) {
    return failure("encoding", start, error);
  }
}

export function decodeArchitectureYaml(text: string): DecodeArchitectureOutcome {
  const start = performance.now();
  try {
    const document = checkedDocument(readYamlData(text));
    return { status: "success", document, durationMs: performance.now() - start };
  } catch (error) {
    return failure("decoding", start, error);
  }
}

export const architectureDocumentCodec = {
  encode: encodeArchitectureYaml,
  decode: decodeArchitectureYaml,
} satisfies ArchitectureDocumentCodec;
