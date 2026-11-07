import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { z } from "zod";
import type { ComponentManifest, ManifestArchitectureArtifact } from "../src/architecture/generated/contracts";

const text = z.string().trim().min(1);
const manifestText = z.string().min(1).refine((value) => value.trim().length > 0);
const artifact = z.strictObject({ path: manifestText });
const artifactList = z.array(artifact).min(1).max(128);
const architectureArtifact = z.strictObject({
  path: manifestText,
  enforcer: manifestText.optional(),
  inputs: z.array(manifestText).max(128).optional(),
});
const componentSchema = z.strictObject({
  name: manifestText,
  description: manifestText,
  artifacts: z.strictObject({
    behavior: artifactList,
    observability: artifactList,
    architecture: z.array(architectureArtifact).min(1).max(128),
    contracts: artifactList,
  }),
  children: z.array(z.strictObject({ name: manifestText, path: manifestText })).max(128).optional(),
}) satisfies z.ZodType<ComponentManifest>;

// This bootstrap accepts Service inventory only. Add schema-aware checks with real SLIs.
const serviceSchema = z.strictObject({
  apiVersion: z.literal("openslo/v1"),
  kind: z.literal("Service"),
  metadata: z.strictObject({
    name: z.string().max(63).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/),
    displayName: text.optional(),
    labels: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
    annotations: z.record(z.string(), z.string()).optional(),
  }),
  spec: z.strictObject({ description: text.max(1050) }),
});

const ignoredDirectories = new Set([
  ".git", "node_modules", "target", "dist", "build", "coverage", "reports",
  "playwright-report", "test-results",
]);

async function* constraintFilesIn(directory: string): AsyncGenerator<string> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isFile() && (entry.name === "component.yaml" || entry.name.endsWith(".tsp"))) yield path;
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
      yield* constraintFilesIn(path);
    }
  }
}

function requireInside(root: string, path: string): void {
  const location = relative(root, path);
  if (location === ".." || location.startsWith(`..${sep}`) || isAbsolute(location)) {
    throw new Error(`Component reference leaves the repository: ${path}`);
  }
}

function isLiteralReference(reference: string): boolean {
  return !isAbsolute(reference) && !reference.startsWith("-") &&
    !/[:\\*?\[\]{};|&`$<>\u0000-\u001f\u007f]/.test(reference);
}

async function localPath(root: string, directory: string, reference: string): Promise<string> {
  if (!isLiteralReference(reference)) {
    throw new Error(`Component paths must be literal local relative paths: ${reference}`);
  }
  // Bun realpath normalizes '..' before following symlinks. Walk each segment
  // first so parent references use the actual target directory, as native I/O does.
  let path = directory;
  for (const segment of reference.split("/")) {
    if (!(await stat(path)).isDirectory()) throw new Error(`Expected a directory: ${path}`);
    if (segment === "..") path = dirname(path);
    else if (segment !== "" && segment !== ".") path = await realpath(resolve(path, segment));
  }
  requireInside(root, path);
  return path;
}

function requireLiteralAnalyzerPath(root: string, path: string): void {
  const reference = relative(root, path).split(sep).join("/") || ".";
  if (!isLiteralReference(reference)) {
    throw new Error(`Analyzer paths must stay literal after canonicalization: ${reference}`);
  }
}

async function localFile(root: string, directory: string, reference: string): Promise<string> {
  const path = await localPath(root, directory, reference);
  if (!(await stat(path)).isFile()) throw new Error(`Expected a file: ${path}`);
  return path;
}

async function validateRootAnalyzer(
  root: string,
  directory: string,
  entries: ManifestArchitectureArtifact[],
): Promise<void> {
  const annotated = entries.filter((entry) => entry.enforcer !== undefined || entry.inputs !== undefined);
  // Path-only manifests remain valid for cookbook checks. Import discovery has
  // the additional requirement that a root analyzer must be declared.
  if (annotated.length === 0) return;
  if (annotated.length !== 1) throw new Error("Only one root analyzer may be declared");
  const [analyzer] = annotated;
  if (analyzer?.enforcer !== "dependency-cruiser") throw new Error("Root enforcer must be dependency-cruiser");
  if (!analyzer.inputs?.length) throw new Error("Root analyzer requires explicit source inputs");
  requireLiteralAnalyzerPath(root, await localFile(root, directory, analyzer.path));
  for (const input of analyzer.inputs) {
    const path = await localPath(root, directory, input);
    requireLiteralAnalyzerPath(root, path);
    const entry = await stat(path);
    if (!entry.isFile() && !entry.isDirectory()) throw new Error(`Expected a source file or directory: ${path}`);
  }
}

async function readYaml(path: string): Promise<unknown> {
  try {
    return Bun.YAML.parse(await readFile(path, "utf8"));
  } catch (cause) {
    throw new Error(`Cannot read YAML: ${path}`, { cause });
  }
}

export async function validateComponents(repositoryRoot: string): Promise<Set<string>> {
  const root = await realpath(repositoryRoot);
  const visited = new Set<string>();
  const names = new Set<string>();
  const behaviors = new Set<string>();
  const observability = new Set<string>();
  const contracts = new Set<string>();

  async function visit(path: string, expectedName?: string): Promise<void> {
    if (visited.has(path)) throw new Error(`Component linked more than once: ${path}`);
    visited.add(path);
    const parsed = componentSchema.safeParse(await readYaml(path));
    if (!parsed.success) throw new Error(`Invalid component ${path}: ${parsed.error.message}`);
    const component = parsed.data;
    if (expectedName !== undefined && component.name !== expectedName) {
      throw new Error(`Child name ${expectedName} does not match ${component.name}: ${path}`);
    }
    if (names.has(component.name)) throw new Error(`Duplicate component name: ${component.name}`);
    names.add(component.name);
    if (expectedName === undefined) await validateRootAnalyzer(root, dirname(path), component.artifacts.architecture);

    for (const [kind, entries] of Object.entries(component.artifacts)) {
      for (const entry of entries) {
        const artifactPath = await localFile(root, dirname(path), entry.path);
        if (kind === "behavior") {
          const location = relative(resolve(root, "cookbook/behavior"), artifactPath);
          requireInside(resolve(root, "cookbook/behavior"), artifactPath);
          if (!location.endsWith(".feature")) {
            throw new Error(`Behavior must be a registered Cucumber feature: ${artifactPath}`);
          }
          behaviors.add(artifactPath);
        }
        if (kind === "observability") observability.add(artifactPath);
        if (kind === "contracts" && artifactPath.endsWith(".tsp")) contracts.add(artifactPath);
      }
    }
    for (const child of component.children ?? []) {
      const childPath = await localFile(root, dirname(path), `${child.path}/component.yaml`);
      await visit(childPath, child.name);
    }
    console.log(`Valid component links: ${relative(root, path)}`);
  }

  await visit(await localFile(root, root, "component.yaml"));
  const contractDirectory = resolve(root, "cookbook/interfaces");
  for await (const path of constraintFilesIn(root)) {
    const actual = await realpath(path);
    if (basename(path) === "component.yaml") {
      if (!visited.has(actual)) throw new Error(`Unlinked component manifest: ${path}`);
    } else {
      requireInside(contractDirectory, actual);
      if (!contracts.has(actual)) throw new Error(`TypeSpec contract has no component owner: ${path}`);
    }
  }
  for (const path of contracts) requireInside(contractDirectory, path);
  for await (const path of new Bun.Glob("cookbook/behavior/**/*.feature").scan(root)) {
    if (!behaviors.has(await realpath(resolve(root, path)))) {
      throw new Error(`Cucumber feature has no component owner: ${path}`);
    }
  }
  for (const path of observability) {
    const parsed = serviceSchema.safeParse(await readYaml(path));
    if (!parsed.success) throw new Error(`Invalid OpenSLO Service ${path}: ${parsed.error.message}`);
    console.log(`Valid OpenSLO Service policy: ${relative(root, path)}`);
  }
  return contracts;
}
