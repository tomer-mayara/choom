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

export type DecodeDuplicationReportOutcome = DecodedDuplicationReport | DuplicationDecodeFailure;

export interface DecodedBaseline {
  status: "success";
  baseline: ChoomDomain.Baseline;
  durationMs: number;
}

export interface DecodedDuplicationReport {
  status: "success";
  report: ChoomDomain.DuplicationReport;
  durationMs: number;
}

export interface DuplicationDecodeFailure {
  status: "failure";
  stage: "decoding";
  code: DuplicationDecodeFailureCode;
  message: string;
  durationMs: number;
}

export type DuplicationDecodeFailureCode = "unsupported-version" | "invalid-encoding" | "invalid-document" | "limit-exceeded" | "baseline-mismatch";

export interface DuplicationReportCodec {
  decode(text: baselineYaml, baseline: ChoomDomain.Baseline, baselineSha256: ChoomDomain.duplicationDigest): DecodeDuplicationReportOutcome;
}

export type baselineYaml = string;
