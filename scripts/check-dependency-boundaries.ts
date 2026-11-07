import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ICruiseResult } from "dependency-cruiser";

type ImportForm = "runtime" | "type" | "inline-type" | "type-query";
type Probe = readonly [from: string, to: string, form: ImportForm, rule?: string];

const view = "src/architecture/workspace-view.ts";
const workflow = "src/architecture/load-workflow.ts";
const workspace = "src/architecture/workspace.ts";
const analyzerFactory = "src/architecture/create-architectural-layer.ts";
const analyzer = "src/architecture/dependency-cruiser/architectural-layer.ts";
const discovery = "src/architecture/repository-discovery.ts";
const manifest = "src/architecture/component-manifest.ts";
const documents = "src/documents/document-files.ts";
const codec = "src/lib/architecture-yaml.ts";
const parser = "src/lib/architecture-yaml/parse.ts";
const layout = "src/lib/architecture-layout.ts";
const domain = "src/domain/architecture-document.ts";
const controls = "src/components/workspace-controls.tsx";
const platformContracts = "src/platform/generated/contracts.ts";
const applicationBoundary = "application-does-not-import-ui-or-composition";
const codecBoundary = "document-codec-is-independent-of-storage-and-analyzers";
const viewBoundary = "workspace-view-uses-data-bindings";
const analyzerBoundary = "concrete-analyzer-access-through-composition";

const allowed: readonly Probe[] = [
  ["src/App.tsx", workspace, "runtime"],
  ["src/App.tsx", "src/platform/desktop.ts", "runtime"],
  [workspace, workflow, "runtime"],
  [workspace, analyzerFactory, "runtime"],
  [analyzerFactory, analyzer, "runtime"],
  [controls, view, "type"],
  [controls, "src/architecture/generated/workflow.ts", "type"],
  [view, documents, "type"],
  [view, layout, "type-query"],
  [view, "src/architecture/generated/workflow.ts", "type"],
  [view, "src/domain/generated/contracts.ts", "type"],
  [view, "src/domain/readonly-data.ts", "type"],
  [discovery, "src/platform/repository.ts", "type"],
  [manifest, "node_modules/yaml/index.js", "runtime"],
  [workflow, platformContracts, "type"],
  [documents, "src/platform/documents.ts", "type"],
  [documents, platformContracts, "type"],
  [documents, codec, "runtime"],
  [codec, parser, "runtime"],
  [codec, domain, "runtime"],
  [codec, "src/lib/generated/contracts.ts", "type"],
  [parser, "node_modules/yaml/index.js", "runtime"],
  [domain, "node_modules/zod/index.js", "runtime"],
];

const forbidden: readonly Probe[] = [
  [discovery, "src/components/diagram-panel.tsx", "runtime", applicationBoundary],
  [discovery, "src/platform/documents.ts", "type", "discovery-uses-repository-access"],
  [discovery, "src/platform/repository.ts", "runtime", "application-platform-imports-are-erased"],
  [manifest, workspace, "type", applicationBoundary],
  ["src/architecture/discovery-problem.ts", "node_modules/react/index.js", "type", applicationBoundary],
  ["src/architecture/snapshot-copy.ts", analyzerFactory, "runtime", applicationBoundary],
  ["src/architecture/snapshot-copy.ts", "node:fs", "runtime", "application-does-not-import-runtime-builtins"],
  ["src/architecture/snapshot-copy.ts", "src/components/diagram-panel.tsx", "type", applicationBoundary],
  ["src/architecture/snapshot-copy.ts", "src/platform/generated/unrelated.ts", "type", "application-architecture-uses-platform-contracts"],
  [workflow, "src/platform/repository.ts", "type", "application-architecture-uses-platform-contracts"],
  [workflow, platformContracts, "runtime", "application-platform-imports-are-erased"],
  [documents, "src/components/diagram-panel.tsx", "runtime", applicationBoundary],
  [documents, workspace, "type", applicationBoundary],
  [documents, "src/platform/repository.ts", "type", "document-lifecycle-uses-document-access"],
  [documents, "src/platform/documents.ts", "inline-type", "application-platform-imports-are-erased"],
  [view, workflow, "type", viewBoundary],
  [view, "src/platform/repository.ts", "type", viewBoundary],
  [view, "node_modules/react/index.js", "type", viewBoundary],
  [view, analyzer, "type", viewBoundary],
  [view, documents, "inline-type", "workspace-view-imports-are-erased"],
  [view, layout, "runtime", "workspace-view-imports-are-erased"],
  [controls, workflow, "type", "components-use-workspace-view"],
  [controls, workspace, "type", "components-use-workspace-view"],
  ["src/App.tsx", workflow, "type", "app-uses-workspace-composition"],
  ["src/components/architecture-details.tsx", view, "type", "diagram-renders-prepared-data"],
  [codec, layout, "runtime", codecBoundary],
  [codec, "src/lib/generated/unrelated.ts", "type", codecBoundary],
  [parser, documents, "type", codecBoundary],
  [parser, "node_modules/elkjs/index.js", "runtime", codecBoundary],
  ["src/lib/generated/contracts.ts", "src/platform/documents.ts", "type", codecBoundary],
  [domain, "node_modules/yaml/index.js", "runtime", "domain-is-platform-independent"],
  [workspace, analyzer, "type", analyzerBoundary],
  [workspace, "node_modules/dependency-cruiser/index.js", "runtime", analyzerBoundary],
];

function moduleSpecifier(target: string): string {
  if (target.startsWith("src/")) return `@/${target.slice(4)}`;
  if (target.startsWith("node_modules/")) return target.slice("node_modules/".length, -"/index.js".length);
  return target;
}

function importStatement(target: string, form: ImportForm, index: number): string {
  const specifier = JSON.stringify(moduleSpecifier(target));
  const alias = `Imported${index}`;
  switch (form) {
    case "runtime": return `import * as ${alias} from ${specifier}; export const value${index} = ${alias};`;
    case "type": return `import type { Marker as ${alias} } from ${specifier}; export type Value${index} = ${alias};`;
    case "inline-type": return `import { type Marker as ${alias} } from ${specifier}; export type Value${index} = ${alias};`;
    case "type-query": return `export type ${alias} = import(${specifier}).Marker;`;
  }
}

async function writeProbeModules(root: string, probes: readonly Probe[]): Promise<void> {
  const modules = new Map<string, string[]>();
  for (const [index, [from, to, form]] of probes.entries()) {
    const statements = modules.get(from) ?? [];
    statements.push(importStatement(to, form, index));
    modules.set(from, statements);
    if (!to.startsWith("node:") && !modules.has(to)) modules.set(to, []);
  }
  for (const [path, statements] of modules) {
    const modulePath = join(root, path);
    const folder = dirname(modulePath);
    await mkdir(folder, { recursive: true });
    if (path.startsWith("node_modules/")) {
      await writeFile(join(folder, "package.json"), '{"type":"module","main":"index.js"}\n');
    }
    await writeFile(modulePath, ["export class Marker {}", ...statements, ""].join("\n"));
  }
}

function verifyProbes(report: ICruiseResult, probes: readonly Probe[]): void {
  for (const [from, to, form, rule] of probes) {
    const label = `${form} import ${from} -> ${to}`;
    const builtin = to.startsWith("node:");
    const resolved = builtin ? to.slice("node:".length) : to;
    const edge = report.modules.find((module) => module.source === from)?.dependencies.find((dependency) => dependency.resolved === resolved);
    if (!edge || edge.couldNotResolve) throw new Error(`Probe could not resolve ${label}.`);
    if (builtin && (!edge.coreModule || edge.protocol !== "node:" || !edge.dependencyTypes.includes("core"))) {
      throw new Error(`Probe expected a Node built-in edge for ${label}.`);
    }
    const erased = form === "type" || form === "type-query";
    const typeOnly = form === "type" || form === "inline-type";
    if (edge.preCompilationOnly !== erased || edge.dependencyTypes.includes("type-only") !== typeOnly) {
      throw new Error(`Probe reported unexpected import flags for ${label}.`);
    }
    const violations = report.summary.violations.filter((violation) => violation.from === from && violation.to === resolved);
    if (rule && !violations.some((violation) => violation.rule.name === rule && violation.rule.severity === "error")) {
      throw new Error(`Expected ${rule} to reject ${label}.`);
    }
    if (!rule && violations.length > 0) {
      throw new Error(`Expected ${label} to pass, got ${violations.map((violation) => violation.rule.name).join(", ")}.`);
    }
  }
}

async function checkProbes(repository: string, probes: readonly Probe[]): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "choom-dependency-probes-"));
  try {
    await copyFile(join(repository, "tsconfig.json"), join(root, "tsconfig.json"));
    await copyFile(join(repository, "package.json"), join(root, "package.json"));
    await writeProbeModules(root, probes);
    const cruise = Bun.spawnSync([
      "node", join(repository, "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs"),
      "src", "--config", join(repository, ".dependency-cruiser.cjs"), "--output-type", "json",
    ], { cwd: root, stdout: "pipe", stderr: "pipe" });
    if (cruise.exitCode !== 0) throw new Error(`Dependency probe cruise failed.\n${cruise.stderr.toString()}`);
    // The JSON reporter uses exit status zero even when a rule rejects an edge.
    const report = JSON.parse(cruise.stdout.toString()) as ICruiseResult;
    verifyProbes(report, probes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const repository = fileURLToPath(new URL("..", import.meta.url));
await checkProbes(repository, allowed);
await checkProbes(repository, forbidden);
console.log(`Verified ${allowed.length} allowed and ${forbidden.length} forbidden dependency probes.`);
