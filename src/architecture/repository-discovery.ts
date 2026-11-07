import { z } from "zod";
import { ComponentCatalog } from "../domain/component-catalog.ts";
import type { AnalysisDescriptor, ComponentDeclaration } from "../domain/generated/contracts";
import type { InternalRepositoryPath, RepositoryFailure } from "../platform/generated/contracts";
import type { RepositoryAccess } from "../platform/repository";
import { isManifestReference, readComponentManifest } from "./component-manifest.ts";
import { DiscoveryProblem } from "./discovery-problem.ts";
import type {
  ComponentManifest,
  DiscoveredRepository,
  DiscoveryFailureCode,
  DiscoveryOperations,
  DiscoveryOutcome,
  DiscoveryRequest,
  ManifestArchitectureArtifact,
} from "./generated/contracts";

const MAX_MANIFESTS = 256;
const MAX_TOTAL_TEXT_BYTES = 8 * 1024 * 1024;
const discoveryRequestSchema = z.strictObject({
  rootPath: z.string().min(1).refine((value) => new TextEncoder().encode(value).byteLength <= 4096),
});
type DiscoveryOperation = (
  request: Parameters<DiscoveryOperations["discover"]>[0],
) => Promise<ReturnType<DiscoveryOperations["discover"]>>;

interface ManifestLocation {
  id: string;
  base: string;
  manifest: ComponentManifest;
}

export class RepositoryDiscovery {
  private readonly access: RepositoryAccess;
  private readonly now: () => number;

  constructor(access: RepositoryAccess, now: () => number = () => performance.now()) {
    this.access = access;
    this.now = now;
  }

  readonly discover: DiscoveryOperation = async (request: DiscoveryRequest): Promise<DiscoveryOutcome> => {
    const started = this.now();
    let repositorySession: string | undefined;
    try {
      if (!discoveryRequestSchema.safeParse(request).success) {
        throw new DiscoveryProblem("invalid-root", "Choose an existing repository directory.");
      }
      const opened = await this.access.openRepository(request);
      if (opened.status === "failure") throw accessProblem(opened, "invalid-root", "The repository could not be opened.");
      repositorySession = opened.value.repositorySession;
      const repository = await new DiscoveryRun(this.access, repositorySession).discover();
      return { status: "success", repository, durationMs: this.duration(started) };
    } catch (error) {
      let problem = error instanceof DiscoveryProblem ? error : new DiscoveryProblem("access-failed", "Repository access failed.");
      if (repositorySession !== undefined) problem = await this.releaseAfterFailure(repositorySession, problem);
      return { status: "failure", stage: "discovery", code: problem.code, message: problem.message, durationMs: this.duration(started) };
    }
  };

  private duration(started: number): number {
    const elapsed = this.now() - started;
    return Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  }

  private async releaseAfterFailure(session: string, problem: DiscoveryProblem): Promise<DiscoveryProblem> {
    try {
      const closed = await this.access.closeRepository({ repositorySession: session });
      if (closed.status === "success") return problem;
    } catch {
      // Cleanup failure must remain visible when a transport rejects its promise.
    }
    return new DiscoveryProblem("access-failed", `${problem.message} The repository session could not be closed.`);
  }
}

/** Mutable traversal state belongs to one discovery and never outlives its result. */
class DiscoveryRun {
  readonly #components: ComponentDeclaration[] = [];
  readonly #directories = new Set<string>();
  readonly #names = new Set<string>();
  #textBytes = 0;
  private readonly access: RepositoryAccess;
  private readonly session: string;

  constructor(access: RepositoryAccess, session: string) {
    this.access = access;
    this.session = session;
  }

  async discover(): Promise<DiscoveredRepository> {
    const root = await this.readManifest(".");
    this.addComponent(root);
    const analysis = await this.selectAnalyzer(root);
    await this.visit(root);
    const components = ComponentCatalog.declarationsSchema.parse(this.#components);
    components.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    return { repositorySession: this.session, name: root.manifest.name, components, analysis };
  }

  private async readManifest(id: string): Promise<ManifestLocation> {
    const path = id === "." ? "component.yaml" : `${id}/component.yaml`;
    const read = await this.access.readRepositoryText({ repositorySession: this.session, path });
    if (read.status === "failure") throw accessProblem(read, "manifest-unreadable", `The manifest at '${path}' could not be read.`);
    this.#textBytes += new TextEncoder().encode(read.value.text).byteLength;
    if (this.#textBytes > MAX_TOTAL_TEXT_BYTES) throw new DiscoveryProblem("limit-exceeded", "The declared manifests exceed the total text limit.");
    const manifest = readComponentManifest(read.value.text);
    // A linked directory owns the component; a contained manifest symlink owns its references.
    const separator = read.value.path.lastIndexOf("/");
    const base = separator < 0 ? "." : read.value.path.slice(0, separator);
    return { id, base, manifest };
  }

  private addComponent(location: ManifestLocation, parent?: string): void {
    if (this.#directories.has(location.id) || this.#names.has(location.manifest.name)) {
      throw new DiscoveryProblem("duplicate-component", "Each declared component needs a unique directory and name.");
    }
    if (this.#components.length >= MAX_MANIFESTS) throw new DiscoveryProblem("limit-exceeded", "The repository declares too many components.");
    this.#directories.add(location.id);
    this.#names.add(location.manifest.name);
    this.#components.push({ id: location.id, name: location.manifest.name, ...(parent === undefined ? {} : { parent }) });
  }

  private async visit(location: ManifestLocation): Promise<void> {
    const artifacts = location.manifest.artifacts;
    for (const entries of [artifacts?.behavior, artifacts?.observability, artifacts?.architecture, artifacts?.contracts]) {
      if (!entries?.length) continue;
      const resolved = await this.resolve(location.base, entries.map((entry) => entry.path), "invalid-reference");
      if (resolved.some((item) => item.kind !== "file")) throw new DiscoveryProblem("invalid-reference", "A declared artifact must be a file.");
    }
    for (const child of location.manifest.children ?? []) {
      const [resolved] = await this.resolve(location.base, [child.path], "invalid-reference");
      if (resolved?.kind !== "directory") throw new DiscoveryProblem("invalid-reference", "A child component must name a directory.");
      if (this.#directories.has(resolved.path)) throw new DiscoveryProblem("duplicate-component", "A component directory is linked more than once.");
      if (this.#components.length >= MAX_MANIFESTS) throw new DiscoveryProblem("limit-exceeded", "The repository declares too many components.");
      const linked = await this.readManifest(resolved.path);
      if (linked.manifest.name !== child.name) throw new DiscoveryProblem("name-mismatch", "A child name does not match its component manifest.");
      this.addComponent(linked, location.id);
      await this.visit(linked);
    }
  }

  private async selectAnalyzer(root: ManifestLocation): Promise<AnalysisDescriptor> {
    const annotated = (root.manifest.artifacts?.architecture ?? []).filter((entry) => entry.enforcer !== undefined || entry.inputs !== undefined);
    if (annotated.length === 0) throw new DiscoveryProblem("missing-analyzer", "The root manifest must declare an analyzer.");
    if (annotated.length !== 1) throw new DiscoveryProblem("multiple-analyzers", "The root manifest must declare exactly one analyzer.");
    const entry = annotated[0];
    if (entry?.enforcer !== "dependency-cruiser") throw new DiscoveryProblem("unsupported-enforcer", "The declared root enforcer is not supported.");
    const inputs = await this.analyzerInputs(root.base, entry);
    const [config] = await this.resolve(root.base, [entry.path], "invalid-reference");
    if (config?.kind !== "file") throw new DiscoveryProblem("invalid-reference", "The analyzer configuration must be a file.");
    if (!isManifestReference(config.path)) throw new DiscoveryProblem("invalid-reference", "The resolved analyzer configuration must be a literal relative path.");
    return { enforcer: entry.enforcer, config: config.path, inputs };
  }

  private async analyzerInputs(base: string, entry: ManifestArchitectureArtifact): Promise<string[]> {
    if (!entry.inputs?.length) throw new DiscoveryProblem("invalid-input", "The root analyzer needs explicit source inputs.");
    const paths = await this.resolve(base, entry.inputs, "invalid-input");
    if (paths.some((item) => !isManifestReference(item.path))) {
      throw new DiscoveryProblem("invalid-input", "Resolved analyzer inputs must be literal relative paths.");
    }
    return [...new Set(paths.map((item) => item.path))].sort();
  }

  private async resolve(base: string, paths: string[], code: "invalid-reference" | "invalid-input"): Promise<InternalRepositoryPath[]> {
    if (paths.some((path) => !isManifestReference(path))) {
      throw new DiscoveryProblem(code, "Manifest references must be literal relative paths.");
    }
    const resolved = await this.access.resolveRepositoryPaths({ repositorySession: this.session, base, paths });
    if (resolved.status === "failure") throw accessProblem(resolved, code, "A declared path could not be resolved.");
    const internal: InternalRepositoryPath[] = [];
    for (const item of resolved.value.paths) {
      if (item.location === "outside") throw new DiscoveryProblem(code, "Manifest references must stay inside the repository.");
      internal.push(item);
    }
    return internal;
  }
}

function accessProblem(failure: RepositoryFailure, fallback: DiscoveryFailureCode, message: string): DiscoveryProblem {
  if (failure.code === "limit-exceeded") return new DiscoveryProblem("limit-exceeded", "Repository access exceeded a resource limit.");
  if (failure.code === "outside-root") return new DiscoveryProblem("invalid-reference", "Manifest references must stay inside the repository.");
  if (["invalid-session", "unavailable", "invalid-response", "source-changed", "io-error"].includes(failure.code)) {
    return new DiscoveryProblem("access-failed", "Repository access failed; retry discovery from the selected root.");
  }
  return new DiscoveryProblem(fallback, message);
}
