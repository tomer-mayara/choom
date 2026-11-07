import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { parse, stringify } from "yaml";
import { ScenarioControls } from "./scenario-controls.ts";

export type Data = Record<string, unknown>;
export interface FilePair { sourceFile: string; targetFile: string }

export function object(value: unknown): Data {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Data;
}

export function objects(value: unknown): Data[] {
  assert.ok(Array.isArray(value));
  return value.map(object);
}

export function quoted(text: string): string[] {
  return [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "");
}

function savedRelationship(source: string, target: string, pairs: FilePair[]): Data {
  const identifiers: Record<string, string> = {
    "src -> packages/core": "imports:src:packages%2Fcore",
    "src/ui -> src/core": "imports:src%2Fui:src%2Fcore",
  };
  const id = identifiers[`${source} -> ${target}`];
  assert.ok(id, `No explicit saved relationship fixture for ${source} -> ${target}`);
  return { id, source, target, kind: "imports", evidence: pairs.map((pair) => ({ ...pair, variants: [{}] })) };
}

export class ImportFixture {
  directory = "";
  root = "";
  document: Data = {};
  report: Data = {};
  declarations: string[] = [".", "src", "packages/core"];
  manifests = new Map<string, Data>();
  files = new Map<string, string>();
  directories = new Set<string>();
  links = new Map<string, string>();
  absentFiles = new Set<string>();
  inputs: string[] = ["src"];
  facts: Data = {};
  pairs: FilePair[] = [];
  savedText?: string;
  savedPath = "";
  originalSavedBytes?: string;
  destination = "";
  controls = new ScenarioControls();
  private initialReport = "";
  private deniedManifest?: { path: string; mode: number };

  static async create(): Promise<ImportFixture> {
    const fixture = new ImportFixture();
    fixture.directory = await mkdtemp(join(tmpdir(), "choom-import-"));
    fixture.root = join(fixture.directory, "Atlas");
    fixture.savedPath = join(fixture.directory, "input.choom.yaml");
    fixture.destination = join(fixture.directory, "export.choom.yaml");
    fixture.document = object(parse(await readFile(new URL("../../fixtures/architecture-import/declared-components.choom.yaml", import.meta.url), "utf8")));
    fixture.report = object(JSON.parse(await readFile(new URL("../../fixtures/architecture-import/completed-report.json", import.meta.url), "utf8")));
    fixture.initialReport = JSON.stringify(fixture.report);
    fixture.declare(fixture.declarations);
    return fixture;
  }

  declare(ids: string[]): void {
    this.declarations = ids.includes(".") ? [...ids] : [".", ...ids];
    this.manifests.clear();
    for (const id of this.declarations) {
      this.manifests.set(id, this.manifest(id));
      this.directories.add(id);
    }
    this.rootManifest().children = this.declarations.filter((id) => id !== ".").map((id) => ({ name: id, path: id }));
  }

  manifest(id: string): Data {
    const reference = (path: string) => posix.relative(id, path) || ".";
    return {
      name: id === "." ? "Atlas" : id,
      description: "Architecture import acceptance fixture",
      artifacts: {
        behavior: [{ path: reference("fixtures/example.feature") }],
        observability: [{ path: reference("fixtures/service.yaml") }],
        architecture: [{ path: reference(".dependency-cruiser.cjs"), ...(id === "." ? { enforcer: "dependency-cruiser", inputs: [...this.inputs] } : {}) }],
        contracts: [{ path: reference("fixtures/contract.tsp") }],
      },
    };
  }

  rootManifest(): Data {
    const root = this.manifests.get(".");
    assert.ok(root);
    return root;
  }

  setInputs(inputs: string[]): void {
    this.inputs = inputs;
    const entry = objects(object(this.rootManifest().artifacts).architecture)[0];
    assert.ok(entry);
    entry.inputs = inputs;
    object(object(this.report.summary).optionsUsed).args = "intentionally-not-the-manifest-inputs";
    for (const input of inputs) this.directories.add(input);
  }

  file(path: string): Data {
    const modules = objects(this.report.modules);
    const previous = modules.find((entry) => entry.source === path);
    if (previous) return previous;
    const entry: Data = { source: path, dependencies: [], dependents: [], orphan: true, valid: true };
    this.report.modules = [...modules, entry];
    this.files.set(path, this.files.get(path) ?? "export const fixture = true;\n");
    return entry;
  }

  import(source: string, target: string, flags: Data = {}): void {
    const entry = this.file(source);
    this.file(target);
    const specifier = posix.relative(posix.dirname(source), target);
    this.files.set(source, `${this.files.get(source) ?? ""}import "${specifier.startsWith(".") ? specifier : `./${specifier}`}";\n`);
    entry.dependencies = [...objects(entry.dependencies), {
      module: specifier, resolved: target, moduleSystem: "es6", dynamic: false,
      dependencyTypes: ["local"], followable: true, couldNotResolve: false,
      ...flags,
    }];
    entry.orphan = false;
    this.pairs.push({ sourceFile: source, targetFile: target });
  }

  savedComponents(ids: string[]): void {
    this.declarations = [...ids];
    const exampleCounts: Record<string, number> = { src: 3, "packages/core": 1, "src/ui": 1, "src/core": 1 };
    this.document.components = ids.map((id) => ({ id, name: id === "." ? "Atlas" : id, reportedFiles: exampleCounts[id] ?? 0, ...(id === "." ? {} : { parent: "." }) }));
    this.document.relationships = [];
    this.document.diagnostics = [];
    this.savedText = undefined;
  }

  savedImport(source: string, target: string, pairs: FilePair[]): void {
    this.pairs = pairs;
    this.facts.sourceComponent = source;
    this.facts.targetComponent = target;
    this.document.relationships = [savedRelationship(source, target, pairs)];
  }

  async writeDocument(name?: string): Promise<string> {
    if (name) this.document.name = name;
    const bytes = this.savedText ?? stringify(this.document);
    await writeFile(this.savedPath, bytes);
    this.originalSavedBytes = bytes;
    return this.savedPath;
  }

  async materialize(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    for (const directory of this.directories) await mkdir(join(this.root, directory), { recursive: true });
    const common = new Map([
      [".dependency-cruiser.cjs", "module.exports = { forbidden: [], options: { doNotFollow: { path: 'node_modules' } } };\n"],
      ["fixtures/example.feature", "Feature: Fixture architecture\n"],
      ["fixtures/service.yaml", "apiVersion: openslo/v1\nkind: Service\nmetadata: {name: fixture}\nspec: {description: Fixture}\n"],
      ["fixtures/contract.tsp", "model Fixture { name: string; }\n"],
    ]);
    for (const [path, text] of [...common, ...this.files]) {
      const destination = join(this.root, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, text);
    }
    for (const [path, manifest] of this.manifests) {
      await mkdir(join(this.root, path), { recursive: true });
      await writeFile(join(this.root, path, "component.yaml"), stringify(manifest));
    }
    for (const [path, target] of this.links) {
      const destination = join(this.root, path);
      await mkdir(dirname(destination), { recursive: true });
      await rm(destination, { force: true, recursive: true });
      await symlink(target, destination);
    }
    for (const path of this.absentFiles) await rm(join(this.root, path), { force: true, recursive: true });
    await writeFile(join(this.directory, "completed-report.json"), JSON.stringify(this.report, null, 2));
    await writeFile(join(this.directory, "scenario-facts.json"), JSON.stringify(this.facts, null, 2));
  }

  hasRecordedAnalysis(): boolean {
    return JSON.stringify(this.report) !== this.initialReport;
  }

  async denyManifestRead(): Promise<void> {
    assert.notEqual(process.getuid?.(), 0, "Fixture setup limitation: UID 0 can bypass Unix read permissions, so this run cannot establish denied repository access");
    const path = join(this.root, "component.yaml");
    this.deniedManifest = { path, mode: (await stat(path)).mode };
    await chmod(path, 0);
    await assert.rejects(readFile(path), (error: unknown) => error instanceof Error && "code" in error && (error.code === "EACCES" || error.code === "EPERM"), "Fixture setup limitation: removing manifest permissions must produce an actual denied read");
    this.controls.observe("repository-read-denied", "The current user received EACCES or EPERM while reading component.yaml after chmod 000");
  }

  async close(): Promise<void> {
    try {
      if (this.deniedManifest) await chmod(this.deniedManifest.path, this.deniedManifest.mode);
    } finally {
      await rm(this.directory, { recursive: true, force: true });
    }
  }
}
