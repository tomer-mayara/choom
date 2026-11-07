import path from "node:path";
import { stringify } from "yaml";
import type {
  CloseRepositoryRequest,
  CloseRepositoryOutcome,
  OpenRepositoryRequest,
  OpenRepositoryOutcome,
  ReadRepositoryTextRequest,
  ReadRepositoryTextOutcome,
  ResolveRepositoryPathsRequest,
  ResolveRepositoryPathsOutcome,
  ResolvedRepositoryPath,
} from "../../src/platform/generated/contracts";
import type { RepositoryAccess } from "../../src/platform/repository";

/** The native filesystem contract is doubled here; Rust tests cover real paths. */
export class MemoryRepository implements RepositoryAccess {
  readonly rootPath = "/repository";
  readonly files = new Map<string, string>();
  readonly directories = new Set<string>(["."]);
  readonly aliases = new Map<string, string>();
  readonly activeSessions = new Set<string>();
  #nextSession = 0;

  addDirectory(directory: string): void {
    let current = directory;
    while (current !== ".") {
      this.directories.add(current);
      current = path.posix.dirname(current);
    }
  }

  addFile(file: string, text = ""): void {
    this.addDirectory(path.posix.dirname(file));
    this.files.set(file, text);
  }

  setManifest(directory: string, manifest: unknown): void {
    this.addFile(path.posix.join(directory, "component.yaml"), stringify(manifest));
  }

  async openRepository(request: OpenRepositoryRequest): Promise<OpenRepositoryOutcome> {
    if (request.rootPath !== this.rootPath) {
      return { status: "failure", code: "not-found", message: "The selected root does not exist." };
    }
    const repositorySession = `repository-${++this.#nextSession}`;
    this.activeSessions.add(repositorySession);
    return { status: "success", value: { repositorySession } };
  }

  async readRepositoryText(request: ReadRepositoryTextRequest): Promise<ReadRepositoryTextOutcome> {
    if (!this.activeSessions.has(request.repositorySession)) {
      return { status: "failure", code: "invalid-session", message: "The repository is closed." };
    }
    const canonical = this.canonical(".", request.path);
    if (canonical.startsWith("../")) {
      return { status: "failure", code: "outside-root", message: "The file is outside the repository." };
    }
    const text = this.files.get(canonical);
    if (text === undefined) {
      return { status: "failure", code: "not-found", message: "The file does not exist." };
    }
    return { status: "success", value: { path: canonical, text } };
  }

  async resolveRepositoryPaths(request: ResolveRepositoryPathsRequest): Promise<ResolveRepositoryPathsOutcome> {
    if (!this.activeSessions.has(request.repositorySession)) {
      return { status: "failure", code: "invalid-session", message: "The repository is closed." };
    }
    const paths: ResolvedRepositoryPath[] = [];
    for (const input of request.paths) {
      const canonical = this.canonical(request.base, input);
      if (canonical.startsWith("../")) {
        paths.push({ location: "outside", reference: "outside-1" });
      } else if (this.files.has(canonical)) {
        paths.push({ location: "inside", path: canonical, kind: "file" });
      } else if (this.directories.has(canonical)) {
        paths.push({ location: "inside", path: canonical, kind: "directory" });
      } else {
        return { status: "failure", code: "not-found", message: "The path does not exist." };
      }
    }
    return { status: "success", value: { paths } };
  }

  async closeRepository(request: CloseRepositoryRequest): Promise<CloseRepositoryOutcome> {
    this.activeSessions.delete(request.repositorySession);
    return { status: "success", value: { closed: true } };
  }

  private canonical(base: string, input: string): string {
    const absolute = path.posix.resolve(this.rootPath, base, input);
    let relative = path.posix.relative(this.rootPath, absolute) || ".";
    for (const [alias, target] of this.aliases) {
      if (relative === alias || relative.startsWith(`${alias}/`)) {
        relative = path.posix.join(target, relative.slice(alias.length));
        break;
      }
    }
    return relative;
  }
}

export function declaredRepository(): MemoryRepository {
  const repository = new MemoryRepository();
  repository.addFile(".dependency-cruiser.cjs");
  repository.addDirectory("src/components");
  repository.addDirectory("src/lib");
  repository.setManifest(".", {
    name: "Atlas",
    artifacts: {
      architecture: [{ path: ".dependency-cruiser.cjs", enforcer: "dependency-cruiser", inputs: ["src/components", "src/lib"] }],
    },
    children: [{ name: "workspace", path: "src" }],
  });
  repository.setManifest("src", { name: "workspace" });
  return repository;
}
