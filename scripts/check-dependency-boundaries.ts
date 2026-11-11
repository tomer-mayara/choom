import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { ICruiseResult } from "dependency-cruiser";

type ImportForm = "runtime" | "type" | "inline-type" | "type-query";
type Probe = readonly [from: string, to: string, form: ImportForm, rule?: string];

const view = "src/architecture/workspace-view.ts";
const workflow = "src/architecture/load-workflow.ts";
const workspace = "src/architecture/workspace.ts";
const publication = "src/architecture/load-publication.ts";
const codec = "src/lib/baseline-yaml.ts";
const parser = "src/lib/architecture-yaml/parse.ts";
const layout = "src/lib/architecture-layout.ts";
const domain = "src/domain/baseline.ts";
const controls = "src/components/workspace-controls.tsx";
const diagram = "src/components/architecture-diagram.tsx";
const platformContracts = "src/platform/generated/contracts.ts";
const applicationBoundary = "application-does-not-import-ui-or-composition";
const codecBoundary = "baseline-codec-uses-domain-and-yaml";
const viewBoundary = "workspace-view-uses-data-bindings";
const analyzerBoundary = "development-analyzers-stay-out-of-app";
const layoutBoundary = "layout-engine-loads-through-composition";

const allowed: readonly Probe[] = [
  ["src/App.tsx", workspace, "runtime"],
  ["src/App.tsx", "src/platform/desktop.ts", "runtime"],
  [workspace, workflow, "runtime"],
  [workspace, "src/platform/documents.ts", "runtime"],
  [workspace, layout, "runtime"],
  [controls, view, "type"],
  [controls, "src/architecture/generated/workflow.ts", "type"],
  [view, layout, "type-query"],
  [view, "src/architecture/generated/workflow.ts", "type"],
  [view, "src/domain/generated/contracts.ts", "type"],
  [view, "src/domain/readonly-data.ts", "type"],
  [workflow, platformContracts, "type"],
  [workflow, codec, "runtime"],
  [workflow, layout, "type"],
  [workflow, publication, "runtime"],
  [publication, "src/domain/generated/contracts.ts", "type"],
  [layout, "src/domain/generated/contracts.ts", "type"],
  [layout, "node_modules/elkjs/index.js", "runtime"],
  [diagram, layout, "type"],
  [codec, parser, "runtime"],
  [codec, domain, "runtime"],
  [codec, "src/lib/generated/contracts.ts", "type"],
  [parser, "node_modules/yaml/index.js", "runtime"],
  [domain, "node_modules/zod/index.js", "runtime"],
  ["src/platform/browser-documents.ts", platformContracts, "type"],
];

const forbidden: readonly Probe[] = [
  [workflow, "src/components/architecture-diagram.tsx", "runtime", applicationBoundary],
  [publication, workspace, "type", applicationBoundary],
  [publication, "node_modules/react/index.js", "type", applicationBoundary],
  [publication, "node:fs", "runtime", "application-does-not-import-runtime-builtins"],
  [publication, "src/platform/generated/unrelated.ts", "type", "application-architecture-uses-platform-contracts"],
  [workflow, "src/platform/documents.ts", "type", "application-architecture-uses-platform-contracts"],
  [workflow, platformContracts, "runtime", "application-platform-imports-are-erased"],
  [publication, platformContracts, "inline-type", "application-platform-imports-are-erased"],
  [view, workflow, "type", viewBoundary],
  [view, "src/platform/documents.ts", "type", viewBoundary],
  [view, "node_modules/react/index.js", "type", viewBoundary],
  [view, "src/domain/readonly-data.ts", "inline-type", "workspace-view-imports-are-erased"],
  [view, layout, "runtime", "workspace-view-imports-are-erased"],
  [controls, workflow, "type", "components-use-workspace-view"],
  [controls, workspace, "type", "components-use-workspace-view"],
  ["src/App.tsx", workflow, "type", "app-uses-workspace-composition"],
  ["src/App.tsx", "src/platform/documents.ts", "runtime", "app-uses-workspace-composition"],
  ["src/components/architecture-details.tsx", view, "type", "diagram-renders-prepared-data"],
  [workflow, layout, "runtime", layoutBoundary],
  [diagram, layout, "runtime", layoutBoundary],
  [diagram, "node_modules/elkjs/index.js", "runtime", layoutBoundary],
  [codec, layout, "runtime", codecBoundary],
  [codec, "src/lib/generated/unrelated.ts", "type", codecBoundary],
  [codec, "src/platform/documents.ts", "runtime", codecBoundary],
  [codec, workspace, "type", codecBoundary],
  [codec, "node:fs", "runtime", codecBoundary],
  [parser, layout, "type", codecBoundary],
  [parser, "node_modules/elkjs/index.js", "runtime", codecBoundary],
  ["src/lib/generated/contracts.ts", "src/platform/documents.ts", "type", codecBoundary],
  [domain, "node_modules/yaml/index.js", "runtime", "domain-is-platform-independent"],
  [workspace, "node_modules/dependency-cruiser/index.js", "runtime", analyzerBoundary],
  [workflow, "node_modules/ts-morph/index.js", "type", analyzerBoundary],
  [layout, "src/App.tsx", "type", "libraries-do-not-depend-on-ui-or-platform"],
  [controls, "src/App.tsx", "runtime", "components-do-not-import-app-entrypoints"],
  [domain, platformContracts, "type", "domain-is-platform-independent"],
  ["src/platform/documents.ts", workflow, "type", "platform-does-not-depend-on-workspace"],
  ["src/App.tsx", "node_modules/@tauri-apps/api/index.js", "runtime", "desktop-access-through-adapter"],
  [workspace, "test/support/baseline-fixtures.ts", "type", "no-test-code-in-app"],
];

function moduleSpecifier(source: string, target: string): string {
  if (target.startsWith("src/")) return `@/${target.slice(4)}`;
  if (target.startsWith("node_modules/")) return target.slice("node_modules/".length, -"/index.js".length);
  if (target.startsWith("test/")) return relative(dirname(source), target).replaceAll("\\", "/");
  return target;
}

function importStatement(source: string, target: string, form: ImportForm, index: number): string {
  const specifier = JSON.stringify(moduleSpecifier(source, target));
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
    statements.push(importStatement(from, to, form, index));
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
