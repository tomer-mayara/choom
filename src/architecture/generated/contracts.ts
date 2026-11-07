// Generated from TypeSpec by bun run contracts:generate. Do not edit.

import type * as ChoomDomain from "../../domain/generated/contracts";

export interface ComponentManifest {
  name: string;
  description?: string;
  artifacts?: ManifestArtifacts;
  children?: Array<ManifestChild>;
}

export interface DiscoveredRepository {
  repositorySession: string;
  name: string;
  components: Array<ChoomDomain.ComponentDeclaration>;
  analysis: ChoomDomain.AnalysisDescriptor;
}

export interface DiscoveryFailure {
  status: "failure";
  stage: "discovery";
  code: DiscoveryFailureCode;
  message: string;
  durationMs: number;
}

export type DiscoveryFailureCode = "invalid-root" | "manifest-unreadable" | "invalid-manifest" | "missing-analyzer" | "multiple-analyzers" | "unsupported-enforcer" | "invalid-input" | "invalid-reference" | "duplicate-component" | "name-mismatch" | "limit-exceeded" | "access-failed";

export interface DiscoveryOperations {
  discover(request: DiscoveryRequest): DiscoveryOutcome;
}

export type DiscoveryOutcome = DiscoverySuccess | DiscoveryFailure;

export interface DiscoveryRequest {
  rootPath: string;
}

export interface DiscoverySuccess {
  status: "success";
  repository: DiscoveredRepository;
  durationMs: number;
}

export interface ManifestArchitectureArtifact {
  path: string;
  enforcer?: string;
  inputs?: Array<string>;
}

export interface ManifestArtifact {
  path: string;
}

export interface ManifestArtifacts {
  behavior?: Array<ManifestArtifact>;
  observability?: Array<ManifestArtifact>;
  architecture?: Array<ManifestArchitectureArtifact>;
  contracts?: Array<ManifestArtifact>;
}

export interface ManifestChild {
  name: string;
  path: string;
}
