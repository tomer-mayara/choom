// Generated from TypeSpec by bun run contracts:generate. Do not edit.

export type CancelDepCruiserOutcome = StoppedDepCruiserJob | DepCruiserNativeFailure;

export interface CancelledDepCruiserExecution {
  status: "cancelled";
  durationMs: number;
}

export interface CleanedDocumentFiles {
  status: "success";
  cleaned: true;
  durationMs: number;
}

export type CloseRepositoryOutcome = CloseRepositorySuccess | RepositoryFailure;

export interface CloseRepositoryRequest {
  repositorySession: string;
}

export interface CloseRepositorySuccess {
  status: "success";
  value: ClosedRepository;
}

export interface ClosedRepository {
  closed: true;
}

export interface CompletedDepCruiserExecution {
  status: "completed";
  reportJson: string;
  version: "18.7.2";
  workingDirectory: ".";
  completedAtMs: number;
  durationMs: number;
}

export type CreateDocumentSnapshotOutcome = CreatedDocumentSnapshot | DocumentNativeFailure;

export interface CreateDocumentSnapshotRequest {
  text: documentFileText;
}

export interface CreatedDocumentSnapshot {
  status: "success";
  snapshotId: documentSnapshotId;
  durationMs: number;
}

export type DepCruiserExecutionOutcome = CompletedDepCruiserExecution | CancelledDepCruiserExecution | DepCruiserNativeFailure;

export interface DepCruiserJob {
  jobId: string;
}

export interface DepCruiserNativeFailure {
  status: "failure";
  stage: DepCruiserNativeStage;
  code: DepCruiserNativeFailureCode;
  message: string;
  durationMs: number;
}

export type DepCruiserNativeFailureCode = "invalid-request" | "invalid-session" | "invalid-job" | "busy" | "node-not-found" | "unsupported-node" | "analyzer-not-found" | "unsupported-analyzer" | "unsupported-config-path" | "source-changed" | "execution-failed" | "timed-out" | "output-limit" | "report-missing" | "report-invalid" | "cleanup-failed" | "unavailable" | "invalid-response";

export interface DepCruiserNativeProgress {
  jobId: string;
  stage: DepCruiserNativeStage;
  elapsedMs: number;
}

export type DepCruiserNativeStage = "setup" | "analysis" | "cleanup";

export interface DepCruiserOperations {
  prepareDepCruiser(request: PrepareDepCruiserRequest): PrepareDepCruiserOutcome;
  runDepCruiser(request: DepCruiserJob): DepCruiserExecutionOutcome;
  cancelDepCruiser(request: DepCruiserJob): CancelDepCruiserOutcome;
  releaseDepCruiser(request: DepCruiserJob): ReleaseDepCruiserOutcome;
}

export type DesktopAvailability = boolean;

export interface DesktopOperations {
  isDesktop(): DesktopAvailability;
  selectProjectDirectory(): DirectorySelection;
}

export type DirectorySelection = string | null;

export interface DocumentFileOperations {
  createDocumentSnapshot(request: CreateDocumentSnapshotRequest): CreateDocumentSnapshotOutcome;
  readDocumentSnapshot(request: DocumentSnapshotRequest): ReadDocumentTextOutcome;
  releaseDocumentSnapshot(request: DocumentSnapshotRequest): ReleaseDocumentSnapshotOutcome;
  readDocumentFile(request: ReadDocumentFileRequest): ReadDocumentTextOutcome;
  exportDocument(request: ExportDocumentRequest): ExportDocumentOutcome;
  retryDocumentCleanup(request: RetryDocumentCleanupRequest): RetryDocumentCleanupOutcome;
}

export interface DocumentNativeFailure {
  status: "failure";
  stage: DocumentNativeStage;
  code: DocumentNativeFailureCode;
  message: string;
  durationMs: number;
}

export type DocumentNativeFailureCode = "invalid-request" | "invalid-snapshot" | "snapshot-limit" | "not-found" | "not-file" | "limit-exceeded" | "invalid-utf8" | "destination-exists" | "source-changed" | "cleanup-failed" | "io-error" | "unavailable" | "invalid-response";

export type DocumentNativeStage = "storage" | "export" | "cleanup";

export interface DocumentSnapshotRequest {
  snapshotId: documentSnapshotId;
}

export type ExportDocumentOutcome = ExportedDocument | DocumentNativeFailure;

export interface ExportDocumentRequest {
  path: documentFilePath;
  text: documentFileText;
  overwrite: boolean;
}

export interface ExportedDocument {
  status: "success";
  exported: true;
  durationMs: number;
}

export interface ExternalRepositoryPath {
  location: "outside";
  reference: string;
}

export interface InternalRepositoryPath {
  location: "inside";
  path: string;
  kind: "file" | "directory";
}

export type OpenRepositoryOutcome = OpenRepositorySuccess | RepositoryFailure;

export interface OpenRepositoryRequest {
  rootPath: string;
}

export interface OpenRepositorySuccess {
  status: "success";
  value: RepositorySession;
}

export type PrepareDepCruiserOutcome = PreparedDepCruiser | DepCruiserNativeFailure;

export interface PrepareDepCruiserRequest {
  repositorySession: string;
  config: string;
  inputs: Array<string>;
  nodeExecutable?: string;
}

export interface PreparedDepCruiser {
  status: "success";
  value: DepCruiserJob;
}

export interface ReadDocumentFileRequest {
  path: documentFilePath;
}

export interface ReadDocumentText {
  status: "success";
  text: documentFileText;
  durationMs: number;
}

export type ReadDocumentTextOutcome = ReadDocumentText | DocumentNativeFailure;

export type ReadRepositoryTextOutcome = ReadRepositoryTextSuccess | RepositoryFailure;

export interface ReadRepositoryTextRequest {
  repositorySession: string;
  path: string;
}

export interface ReadRepositoryTextSuccess {
  status: "success";
  value: RepositoryText;
}

export type ReleaseDepCruiserOutcome = ReleasedDepCruiserJob | DepCruiserNativeFailure;

export type ReleaseDocumentSnapshotOutcome = ReleasedDocumentSnapshot | DocumentNativeFailure;

export interface ReleasedDepCruiserJob {
  status: "success";
  released: true;
}

export interface ReleasedDocumentSnapshot {
  status: "success";
  released: true;
  durationMs: number;
}

export interface RepositoryFailure {
  status: "failure";
  code: RepositoryFailureCode;
  message: string;
}

export type RepositoryFailureCode = "invalid-request" | "invalid-session" | "not-found" | "not-directory" | "not-file" | "outside-root" | "limit-exceeded" | "invalid-utf8" | "access-denied" | "io-error" | "source-changed" | "unavailable" | "invalid-response";

export interface RepositoryOperations {
  openRepository(request: OpenRepositoryRequest): OpenRepositoryOutcome;
  readRepositoryText(request: ReadRepositoryTextRequest): ReadRepositoryTextOutcome;
  resolveRepositoryPaths(request: ResolveRepositoryPathsRequest): ResolveRepositoryPathsOutcome;
  closeRepository(request: CloseRepositoryRequest): CloseRepositoryOutcome;
}

export interface RepositoryPaths {
  paths: Array<ResolvedRepositoryPath>;
}

export interface RepositorySession {
  repositorySession: string;
}

export interface RepositoryText {
  path: string;
  text: string;
}

export type ResolveRepositoryPathsOutcome = ResolveRepositoryPathsSuccess | RepositoryFailure;

export interface ResolveRepositoryPathsRequest {
  repositorySession: string;
  base: string;
  paths: Array<string>;
}

export interface ResolveRepositoryPathsSuccess {
  status: "success";
  value: RepositoryPaths;
}

export type ResolvedRepositoryPath = InternalRepositoryPath | ExternalRepositoryPath;

export type RetryDocumentCleanupOutcome = CleanedDocumentFiles | DocumentNativeFailure;

export type RetryDocumentCleanupRequest = Record<string, never>;

export interface StoppedDepCruiserJob {
  status: "success";
  stopped: true;
}

export type documentFilePath = string;

export type documentFileText = string;

export type documentSnapshotId = string;
