import assert from "node:assert/strict";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { repositoryContracts } from "../../../src/platform/repository-contract.ts";
import type { RepositoryFailure, ResolvedRepositoryPath } from "../../../src/platform/generated/contracts.ts";
import type { ImportFixture } from "./fixtures.ts";
import type { BrowserImportControls } from "./browser-controls.ts";

function failure(code: RepositoryFailure["code"]): RepositoryFailure {
  return { status: "failure", code, message: `The test repository operation failed: ${code}.` };
}

function ioFailure(error: unknown): RepositoryFailure {
  const code = error instanceof Error && "code" in error ? error.code : undefined;
  return failure(code === "ENOENT" ? "not-found" : code === "EACCES" || code === "EPERM" ? "access-denied" : "io-error");
}

export class BrowserRepositoryTransport {
  private readonly fixture: ImportFixture;
  private readonly controls: BrowserImportControls;
  private readonly sessions = new Map<string, string>();
  private readonly outside = new Map<string, string>();
  private nextSession = 0;

  constructor(fixture: ImportFixture, controls: BrowserImportControls) { this.fixture = fixture; this.controls = controls; }

  async invoke(command: string, request: unknown): Promise<unknown> {
    switch (command) {
      case "repository_open": return this.open(request);
      case "repository_read_text": return this.read(request);
      case "repository_resolve_paths": return this.resolvePaths(request);
      case "repository_close": return this.close(request);
      default: throw new Error(`Unexpected repository command: ${command}`);
    }
  }

  private async open(request: unknown): Promise<unknown> {
    const contract = repositoryContracts.openRepository;
    const { rootPath } = contract.request.parse(request);
    assert.equal(rootPath, this.fixture.root, "The UI must send the selected repository root");
    this.controls.observe("repository-fixture-delivered", "repository_open received the actual fixture root selected by the dialog");
    if (this.fixture.facts.holdOperation === "a repository load") await this.controls.hold("repository load", "repository-load-held");
    let result;
    try {
      const root = await realpath(rootPath);
      if (!(await stat(root)).isDirectory()) return contract.outcome.parse(failure("not-directory"));
      const repositorySession = `repository-${++this.nextSession}`;
      this.sessions.set(repositorySession, root);
      result = { status: "success", value: { repositorySession } };
    } catch (error) { result = ioFailure(error); }
    return contract.outcome.parse(result);
  }

  private async read(request: unknown): Promise<unknown> {
    const contract = repositoryContracts.readRepositoryText;
    const input = contract.request.parse(request);
    const root = this.sessions.get(input.repositorySession);
    if (!root) return contract.outcome.parse(failure("invalid-session"));
    if (this.fixture.facts.permissionDenied) {
      this.controls.observe("repository-read-denied", "repository_read_text received the selected manifest path and returned access-denied");
      return contract.outcome.parse(failure("access-denied"));
    }
    let result;
    try {
      const path = await realpath(resolve(root, input.path));
      const canonical = this.canonical(root, path);
      if (canonical === undefined) return contract.outcome.parse(failure("outside-root"));
      if (!(await stat(path)).isFile()) return contract.outcome.parse(failure("not-file"));
      result = { status: "success", value: { path: canonical, text: await readFile(path, "utf8") } };
    } catch (error) { result = ioFailure(error); }
    return contract.outcome.parse(result);
  }

  private async resolvePaths(request: unknown): Promise<unknown> {
    const contract = repositoryContracts.resolveRepositoryPaths;
    const input = contract.request.parse(request);
    const root = this.sessions.get(input.repositorySession);
    if (!root) return contract.outcome.parse(failure("invalid-session"));
    let result;
    try {
      const paths: ResolvedRepositoryPath[] = [];
      for (const path of input.paths) paths.push(await this.resolvePath(root, input.base, path));
      result = { status: "success", value: { paths } };
    } catch (error) { result = ioFailure(error); }
    return contract.outcome.parse(result);
  }

  private async resolvePath(root: string, base: string, input: string): Promise<ResolvedRepositoryPath> {
    const requested = resolve(root, base, input);
    if (this.canonical(root, requested) === undefined) return this.outsidePath(requested);
    const path = await realpath(requested);
    const canonical = this.canonical(root, path);
    if (canonical === undefined) return this.outsidePath(path);
    const stats = await stat(path);
    assert.ok(stats.isFile() || stats.isDirectory(), "Repository fixtures must resolve to regular files or directories");
    return { location: "inside", path: canonical, kind: stats.isFile() ? "file" : "directory" };
  }

  private canonical(root: string, path: string): string | undefined {
    const local = relative(root, path);
    return local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local) ? undefined : local.split(sep).join("/") || ".";
  }

  private outsidePath(path: string): ResolvedRepositoryPath {
    let reference = this.outside.get(path);
    if (!reference) { reference = `outside-${this.outside.size + 1}`; this.outside.set(path, reference); }
    return { location: "outside", reference };
  }

  private close(request: unknown): unknown {
    const contract = repositoryContracts.closeRepository;
    const { repositorySession } = contract.request.parse(request);
    return contract.outcome.parse(this.sessions.delete(repositorySession)
      ? { status: "success", value: { closed: true } } : failure("invalid-session"));
  }
}
