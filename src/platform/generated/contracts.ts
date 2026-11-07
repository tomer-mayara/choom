// Generated from TypeSpec by bun run contracts:generate. Do not edit.

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

export type DesktopAvailability = boolean;

export interface DesktopOperations {
  isDesktop(): DesktopAvailability;
  selectProjectDirectory(): DirectorySelection;
}

export type DirectorySelection = string | null;

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

export type ReadRepositoryTextOutcome = ReadRepositoryTextSuccess | RepositoryFailure;

export interface ReadRepositoryTextRequest {
  repositorySession: string;
  path: string;
}

export interface ReadRepositoryTextSuccess {
  status: "success";
  value: RepositoryText;
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
