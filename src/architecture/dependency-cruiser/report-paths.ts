import { isCanonicalRepositoryPath, isExternalFile } from "../../domain/architecture-paths.ts";
import type { DiagnosticReference } from "../../domain/generated/contracts.ts";
import type { ResolvedRepositoryPath } from "../../platform/generated/contracts.ts";
import type { RepositoryAccess } from "../../platform/repository.ts";
import { ConversionProblem, type CruiserClassification, type CruiserReport, safeDescription } from "./report.ts";

type PathAccess = Pick<RepositoryAccess, "resolveRepositoryPaths">;
type Classification = "builtin" | "unresolved" | "filesystem";
const MAX_NATIVE_PATHS = 20_001;

function classify(facts: CruiserClassification): Classification {
  const core = facts.coreModule === true || facts.dependencyTypes?.includes("core") === true;
  if ((core && facts.couldNotResolve === true) || (facts.coreModule === false && facts.dependencyTypes?.includes("core"))) {
    throw new ConversionProblem("invalid-observations", "The report contains conflicting module classifications.");
  }
  return core ? "builtin" : facts.couldNotResolve === true ? "unresolved" : "filesystem";
}

function parentName(name: string): string {
  const separator = name.lastIndexOf("/");
  return separator <= 0 ? name : name.slice(0, separator);
}

function mergeFacts(left: CruiserClassification, right: CruiserClassification): CruiserClassification {
  for (const key of ["coreModule", "couldNotResolve"] as const) {
    if (left[key] !== undefined && right[key] !== undefined && left[key] !== right[key]) {
      throw new ConversionProblem("invalid-observations", "A dependency disagrees with its module classification.");
    }
  }
  const merged = {
    coreModule: left.coreModule ?? right.coreModule,
    couldNotResolve: left.couldNotResolve ?? right.couldNotResolve,
    dependencyTypes: left.dependencyTypes?.includes("core") || right.dependencyTypes?.includes("core") ? ["core"] : [],
  };
  classify(merged);
  return merged;
}

/** One conversion owns its aliases, classified references, and native resolution cache. */
export class ReportPaths {
  private readonly access: PathAccess;
  private readonly session: string;
  readonly #modules = new Map<string, DiagnosticReference>();
  readonly #folders = new Map<string, DiagnosticReference>();
  readonly #resolved = new Map<string, ResolvedRepositoryPath>();

  constructor(access: PathAccess, session: string) {
    this.access = access;
    this.session = session;
  }

  async prepare(report: CruiserReport): Promise<void> {
    const base = report.summary.optionsUsed.baseDir ?? ".";
    await this.resolve([base]);
    const resolvedBase = this.#resolved.get(base);
    if (resolvedBase?.location !== "inside" || resolvedBase.kind !== "directory" || resolvedBase.path !== ".") {
      throw new ConversionProblem("unsupported", "The report base directory must be the selected repository root.");
    }
    const classifications = this.classifications(report);
    const filesystem = [...classifications].filter(([, kind]) => kind === "filesystem").map(([name]) => name);
    const sinks = this.syntheticFolders(report, classifications);
    for (const folder of report.folders ?? []) {
      if (!sinks.has(folder.name)) filesystem.push(folder.name);
    }
    await this.resolve(filesystem);
    for (const [name, kind] of classifications) {
      this.#modules.set(name, kind === "filesystem" ? this.filesystemReference(name, "file") : this.nonlocalReference(name, kind));
    }
    for (const folder of report.folders ?? []) {
      const synthetic = sinks.get(folder.name);
      // A root-level target has no directory part; the vendor keeps its file name as a sink.
      const moduleSink = folder.moduleCount === -1 ? this.#modules.get(folder.name) : undefined;
      this.#folders.set(folder.name, synthetic ?? moduleSink ?? this.filesystemReference(folder.name, "folder"));
    }
  }

  module(name: string): DiagnosticReference {
    const reference = this.#modules.get(name);
    if (!reference) throw new ConversionProblem("invalid-observations", "A reported dependency or finding has no module inventory record.");
    return reference;
  }

  folder(name: string): DiagnosticReference {
    const reference = this.#folders.get(name);
    if (!reference) throw new ConversionProblem("invalid-observations", "A folder finding has no matching folder inventory record.");
    return reference;
  }

  private classifications(report: CruiserReport): Map<string, Classification> {
    const facts = new Map<string, CruiserClassification>();
    for (const module of report.modules) {
      const previous = facts.get(module.source);
      if (previous && classify(previous) !== classify(module)) {
        throw new ConversionProblem("invalid-observations", "Repeated module records have conflicting classifications.");
      }
      facts.set(module.source, previous ? mergeFacts(previous, module) : module);
    }
    for (const module of report.modules) {
      for (const dependency of module.dependencies) {
        const target = facts.get(dependency.resolved);
        if (!target) throw new ConversionProblem("invalid-observations", "A reported dependency has no module inventory record.");
        facts.set(dependency.resolved, mergeFacts(target, dependency));
      }
    }
    return new Map([...facts].map(([name, fact]) => [name, classify(fact)]));
  }

  private syntheticFolders(report: CruiserReport, classifications: ReadonlyMap<string, Classification>): Map<string, DiagnosticReference> {
    const synthetic = new Map<string, DiagnosticReference>();
    const sinkNames = new Set((report.folders ?? []).filter(({ moduleCount }) => moduleCount === -1).map(({ name }) => name));
    for (const [source, kind] of classifications) {
      const name = parentName(source);
      if (!sinkNames.has(name) || kind === "filesystem") continue;
      const reference = this.nonlocalReference(name, kind);
      const previous = synthetic.get(name);
      if (previous && previous.kind !== reference.kind) throw new ConversionProblem("invalid-observations", "A folder sink has conflicting classifications.");
      synthetic.set(name, reference);
    }
    return synthetic;
  }

  private nonlocalReference(name: string, kind: "builtin" | "unresolved"): DiagnosticReference {
    return { kind, value: safeDescription(name.replace(/^node:/u, ""), 512) };
  }

  private filesystemReference(name: string, kind: "file" | "folder"): DiagnosticReference {
    const resolved = this.#resolved.get(name);
    if (!resolved) throw new ConversionProblem("invalid-observations", "A reported path was not resolved.");
    if (resolved.location === "outside") return { kind: "outside-root", value: resolved.reference };
    if (resolved.kind !== (kind === "file" ? "file" : "directory")) {
      throw new ConversionProblem("source-changed", `The reported path '${safeDescription(resolved.path, 512)}' changed its file or directory kind.`);
    }
    return { kind: isExternalFile(resolved.path) ? "package" : kind, value: resolved.path };
  }

  private async resolve(paths: string[]): Promise<void> {
    const ordered = [...new Set(paths)].filter((name) => !this.#resolved.has(name)).sort();
    if (this.#resolved.size + ordered.length > MAX_NATIVE_PATHS) throw new ConversionProblem("limit-exceeded", "The report exceeds the native path limit.");
    if (ordered.some((name) => /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(name) && !/^[A-Za-z]:[\\/]/u.test(name))) {
      throw new ConversionProblem("unsupported", "The report contains a filesystem reference with an unsupported URI scheme.");
    }
    for (let offset = 0; offset < ordered.length; offset += 128) {
      const batch = ordered.slice(offset, offset + 128);
      let result;
      try {
        result = await this.access.resolveRepositoryPaths({ repositorySession: this.session, base: ".", paths: batch });
      } catch {
        throw new ConversionProblem("unavailable", "Repository paths could not be resolved.");
      }
      if (result.status === "failure") {
        if (result.code === "limit-exceeded") throw new ConversionProblem("limit-exceeded", "Repository path resolution exceeded its resource limit.");
        if (["not-found", "not-file", "not-directory", "source-changed"].includes(result.code)) {
          const missing = await this.unavailablePath(batch);
          const subject = missing === undefined ? "A reported source path" : `The reported path '${safeDescription(missing, 512)}'`;
          throw new ConversionProblem("source-changed", `${subject} is no longer available; run the analysis again.`);
        }
        throw new ConversionProblem("unavailable", "Repository paths could not be resolved; reopen the repository and try again.");
      }
      if (result.value.paths.length !== batch.length) throw new ConversionProblem("unavailable", "Repository path resolution returned an incomplete response.");
      result.value.paths.forEach((resolved, index) => {
        if (resolved.location === "inside" ? !isCanonicalRepositoryPath(resolved.path, resolved.kind === "directory") : !/^outside-[1-9][0-9]{0,3}$/u.test(resolved.reference)) {
          throw new ConversionProblem("unavailable", "Repository path resolution returned an invalid reference.");
        }
        const input = batch[index];
        if (input !== undefined) this.#resolved.set(input, resolved);
      });
    }
  }

  /** A failed batch has no failing index. Bound diagnosis to a binary search of that batch. */
  private async unavailablePath(batch: string[]): Promise<string | undefined> {
    let candidates = batch;
    try {
      while (candidates.length > 1) {
        const middle = Math.ceil(candidates.length / 2);
        const left = candidates.slice(0, middle);
        const result = await this.access.resolveRepositoryPaths({ repositorySession: this.session, base: ".", paths: left });
        if (result.status === "failure" && !["not-found", "not-file", "not-directory", "source-changed"].includes(result.code)) return undefined;
        candidates = result.status === "failure" ? left : candidates.slice(middle);
      }
      const path = candidates[0];
      if (path === undefined || !isCanonicalRepositoryPath(path, true)) return undefined;
      const result = await this.access.resolveRepositoryPaths({ repositorySession: this.session, base: ".", paths: [path] });
      return result.status === "failure" && ["not-found", "not-file", "not-directory", "source-changed"].includes(result.code) ? path : undefined;
    } catch {
      // The original failure is retained if the repository changes during diagnosis.
      return undefined;
    }
  }
}
