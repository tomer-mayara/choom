import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { z } from "zod";

const text = z.string().trim().min(1);
const artifact = z.strictObject({ path: text });
const artifactList = z.array(artifact).min(1);
const componentSchema = z.strictObject({
  name: text,
  description: text,
  artifacts: z.strictObject({
    behavior: artifactList,
    observability: artifactList,
    architecture: artifactList,
    contracts: artifactList,
  }),
  children: z.array(z.strictObject({ name: text, path: text })).optional(),
});

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

async function* manifestsIn(directory: string): AsyncGenerator<string> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isFile() && entry.name === "component.yaml") yield path;
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
      yield* manifestsIn(path);
    }
  }
}

function requireInside(root: string, path: string): void {
  const location = relative(root, path);
  if (location === ".." || location.startsWith(`..${sep}`) || isAbsolute(location)) {
    throw new Error(`Component reference leaves the repository: ${path}`);
  }
}

async function localFile(root: string, directory: string, reference: string): Promise<string> {
  if (isAbsolute(reference) || reference.includes(":") || reference.includes("\\")) {
    throw new Error(`Component paths must be local relative paths: ${reference}`);
  }
  const path = resolve(directory, reference);
  requireInside(root, path);
  const actualPath = await realpath(path);
  requireInside(root, actualPath);
  if (!(await stat(actualPath)).isFile()) throw new Error(`Expected a file: ${path}`);
  return actualPath;
}

async function readYaml(path: string): Promise<unknown> {
  try {
    return Bun.YAML.parse(await readFile(path, "utf8"));
  } catch (cause) {
    throw new Error(`Cannot read YAML: ${path}`, { cause });
  }
}

export async function validateComponents(repositoryRoot: string): Promise<void> {
  const root = await realpath(repositoryRoot);
  const visited = new Set<string>();
  const names = new Set<string>();
  const behaviors = new Set<string>();
  const observability = new Set<string>();

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
      }
    }
    for (const child of component.children ?? []) {
      const childPath = await localFile(root, dirname(path), `${child.path}/component.yaml`);
      await visit(childPath, child.name);
    }
    console.log(`Valid component links: ${relative(root, path)}`);
  }

  await visit(await localFile(root, root, "component.yaml"));
  for await (const path of manifestsIn(root)) {
    if (!visited.has(await realpath(path))) throw new Error(`Unlinked component manifest: ${path}`);
  }
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
}
