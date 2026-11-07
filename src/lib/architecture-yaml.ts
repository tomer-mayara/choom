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

// Return only fixed, known schema messages. Their order puts a declaration's
// cause before consequential relationship or ownership failures.
const semanticFailureMessages = [
  "Component IDs must be unique",
  "Component names must be unique",
  "Components must have exactly one root with ID '.'",
  "The root component must not have a parent",
  "Nonroot components must reference a declared parent",
  "Component parents must form an acyclic tree rooted at '.'",
  "Reported-file counts must be finite numbers.",
  "Reported-file counts exceed the supported integer limit.",
  "Reported-file counts cannot be negative.",
  "Reported-file counts must be integers.",
  "Expected a canonical repository-relative file path",
  "Expected a canonical repository-relative directory path",
  "Relationships must reference declared components",
  "Import relationships must connect distinct components",
  "Only one import relationship is allowed per ordered component pair",
  "Relationship IDs must be unique",
  "Relationship ID must encode 'imports' and both escaped endpoints",
  "Evidence file ownership must match its relationship endpoints",
  "Import evidence file pairs must be unique",
  "Import flag variants must be unique",
  "Diagnostic file and folder references must use canonical repository-relative paths",
  "Outside-root references must use opaque identifiers, never absolute local paths",
  "Diagnostic metrics must be a record of finite numbers",
];

function checkedDocument(value: unknown): ArchitectureDocument {
  const version: unknown = typeof value === "object" && value !== null
    ? Object.getOwnPropertyDescriptor(value, "schemaVersion")?.value : undefined;
  if (typeof version === "number" && version !== 1) {
    throw new CodecProblem("unsupported-version", "The architecture document schema version is unsupported.");
  }
  const result = architectureDocumentSchema.safeParse(value);
  if (!result.success) {
    const issueMessages = new Set(result.error.issues.map((issue) => issue.message));
    const reason = semanticFailureMessages.find((message) => issueMessages.has(message))
      ?? (result.error.issues.some((issue) => issue.code === "unrecognized_keys")
        ? "The architecture document contains a field that is not part of the schema."
        : "The architecture document does not match the schema.");
    throw new CodecProblem("invalid-document", reason);
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
