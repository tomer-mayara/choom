// Generated from TypeSpec by bun run contracts:generate. Do not edit.

import type * as ChoomDomain from "../../domain/generated/contracts";

export interface BaselineCodec {
  decode(text: baselineYaml): DecodeBaselineOutcome;
}

export interface BaselineDecodeFailure {
  status: "failure";
  stage: "decoding";
  code: BaselineDecodeFailureCode;
  message: string;
  durationMs: number;
}

export type BaselineDecodeFailureCode = "unsupported-version" | "invalid-encoding" | "invalid-document" | "limit-exceeded";

export type DecodeBaselineOutcome = DecodedBaseline | BaselineDecodeFailure;

export interface DecodedBaseline {
  status: "success";
  baseline: ChoomDomain.Baseline;
  durationMs: number;
}

export type baselineYaml = string;
