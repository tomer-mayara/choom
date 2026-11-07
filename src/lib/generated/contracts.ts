// Generated from TypeSpec by bun run contracts:generate. Do not edit.

import type * as ChoomDomain from "../../domain/generated/contracts";

export interface ArchitectureDocumentCodec {
  encode(document: ChoomDomain.ArchitectureDocument): EncodeArchitectureOutcome;
  decode(text: architectureYaml): DecodeArchitectureOutcome;
}

export type DecodeArchitectureOutcome = DecodedArchitectureDocument | DocumentCodecFailure;

export interface DecodedArchitectureDocument {
  status: "success";
  document: ChoomDomain.ArchitectureDocument;
  durationMs: number;
}

export interface DocumentCodecFailure {
  status: "failure";
  stage: "encoding" | "decoding";
  code: DocumentCodecFailureCode;
  message: string;
  durationMs: number;
}

export type DocumentCodecFailureCode = "unsupported-version" | "invalid-encoding" | "invalid-document" | "limit-exceeded";

export type EncodeArchitectureOutcome = EncodedArchitectureDocument | DocumentCodecFailure;

export interface EncodedArchitectureDocument {
  status: "success";
  text: architectureYaml;
  durationMs: number;
}

export type architectureYaml = string;
