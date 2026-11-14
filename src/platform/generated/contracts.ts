// Generated from TypeSpec by bun run contracts:generate. Do not edit.

export interface BaselineDialogOperations {
  selectBaselineFile(): BaselineFileSelection;
  selectDuplicationReportFile(): BaselineFileSelection;
}

export type BaselineFileSelection = string | null;

export type DesktopAvailability = boolean;

export interface DesktopOperations {
  isDesktop(): DesktopAvailability;
}

export interface DocumentFileOperations {
  readDocumentFile(request: ReadDocumentFileRequest): ReadDocumentTextOutcome;
}

export interface DocumentNativeFailure {
  status: "failure";
  stage: DocumentNativeStage;
  code: DocumentNativeFailureCode;
  message: string;
  durationMs: number;
}

export type DocumentNativeFailureCode = "invalid-request" | "not-found" | "not-file" | "limit-exceeded" | "invalid-utf8" | "source-changed" | "io-error" | "unavailable" | "invalid-response";

export type DocumentNativeStage = "storage";

export interface ReadDocumentFileRequest {
  path: documentFilePath;
}

export interface ReadDocumentText {
  status: "success";
  text: documentFileText;
  sha256: documentFileDigest;
  durationMs: number;
}

export type ReadDocumentTextOutcome = ReadDocumentText | DocumentNativeFailure;

export type documentFileDigest = string;

export type documentFilePath = string;

export type documentFileText = string;
