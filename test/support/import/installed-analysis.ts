import assert from "node:assert/strict";
import { lstat, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { CancelDepCruiserOutcome, DepCruiserExecutionOutcome } from "../../../src/platform/generated/contracts.ts";
import { object, objects, type ImportFixture } from "./fixtures.ts";
import { installFixtureDependencies } from "./installed-fixture.ts";
import { PackagedImportDriver } from "./packaged-driver.ts";
import { fixture, type ImportWorld } from "./world.ts";

const config = ".dependency-cruiser.cjs";
const cacheDirectory = ".unexpected-cache";
const markerFile = ".analysis-observed.json";
const source = "src/index.ts";
const target = "src/core.ts";
const rule = "no-core-import";
const initialSource = "export const source = true;\n";
const currentSource = 'import { core } from "./core";\nexport const source = core;\n';

const configPrefix = `
const fs = require("node:fs");
const reportPath = process.argv[process.argv.indexOf("--output-to") + 1];
const markerFile = ${JSON.stringify(markerFile)};
const privateReport = (fs.statSync(reportPath).mode & 0o077) === 0;
function mark(facts) {
  fs.writeFileSync(markerFile, JSON.stringify({ reportPath, privateReport, analyzerPid: process.pid, ...facts }));
}
`;
const standardConfig = configPrefix + `
mark({});
console.log("Configuration output is not the report.");
module.exports = {
  forbidden: [{ name: "${rule}", severity: "error", from: { path: "^src/index[.]ts$" }, to: { path: "^src/core[.]ts$" } }],
  options: { baseDir: ".", cache: { folder: "${cacheDirectory}" }, tsPreCompilationDeps: true },
};
`;

export function setFailedConfig(project: ImportFixture): void {
  project.files.set(config, configPrefix + `
fs.writeFileSync(reportPath, "{");
mark({ wroteReport: true });
process.exit(9);
`);
}

export function setRunningConfig(project: ImportFixture): void {
  project.files.set(config, configPrefix + `
const { spawn } = require("node:child_process");
const childScript = \`
  const fs = require("node:fs");
  const [markerFile, facts] = process.argv.slice(1);
  fs.writeFileSync(markerFile, JSON.stringify({ ...JSON.parse(facts), childPid: process.pid }));
  setInterval(() => {}, 1000);
\`;
spawn(process.execPath, ["-e", childScript, markerFile, JSON.stringify({
  reportPath, privateReport, analyzerPid: process.pid
})], { stdio: "ignore" });
setInterval(() => {}, 1000);
`);
}

export async function prepareInstalledAnalysis(project: ImportFixture): Promise<void> {
  await installFixtureDependencies(project);
  project.files.set(source, initialSource);
  project.files.set(target, "export const core = true;\n");
  project.files.set(config, standardConfig);
}

interface InstalledSession {
  driver: PackagedImportDriver;
  project: ImportFixture;
  repositorySession: string;
}

export interface AnalysisObservation {
  outcome: DepCruiserExecutionOutcome;
  cancellation?: CancelDepCruiserOutcome;
  ready?: boolean;
  privateReportRemoved: boolean;
  wroteReport: boolean;
  cacheExists: boolean;
  childStopped: boolean;
  analyzerStopped: boolean;
}

export async function withInstalledRepository<T>(
  world: ImportWorld,
  analyze: (session: InstalledSession) => Promise<T>,
): Promise<T> {
  const driver = world.installedDriver;
  assert.ok(driver instanceof PackagedImportDriver, "The installed analyzer route needs the installed application driver");
  const project = fixture(world);
  await project.materialize();
  const repository = await driver.invokeNative("repository_open", { rootPath: project.root });
  assert.equal(repository.status, "success", "The installed application must open the selected repository through native IPC");
  const { repositorySession } = repository.value;
  try {
    return await analyze({ driver, project, repositorySession });
  } finally {
    const closed = await driver.invokeNative("repository_close", { repositorySession });
    assert.equal(closed.status, "success", "The native repository session must close");
  }
}

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(() => true, (error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  });
}

async function stopped(pid: unknown): Promise<boolean> {
  if (typeof pid !== "number" || !Number.isSafeInteger(pid) || pid < 1) return false;
  const deadline = Date.now() + 2_000;
  do {
    try {
      const processStat = await readFile(`/proc/${pid}/stat`, "utf8");
      // The process group can stop a descendant before its new parent reaps it.
      if (processStat.slice(processStat.lastIndexOf(")") + 2).startsWith("Z ")) return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return true;
      throw error;
    }
    await delay(50);
  } while (Date.now() < deadline);
  return false;
}

export async function runInstalledAnalysis(session: InstalledSession, cancel = false): Promise<AnalysisObservation> {
  const { driver, project, repositorySession } = session;
  const markerPath = join(project.root, markerFile);
  await rm(markerPath, { force: true });
  const prepared = await driver.invokeNative("depcruiser_prepare", { repositorySession, config, inputs: ["src"] });
  assert.equal(prepared.status, "success", "The installed application must find supported Node and the repository-local analyzer");
  const job = prepared.value;
  try {
    const observed = cancel
      ? await driver.cancelNativeAnalysis(job, { repositorySession, path: markerFile })
      : { outcome: await driver.invokeNative("depcruiser_run", job) };
    const outcome = observed.outcome;
    assert.ok(outcome, "The native analysis operation must return a terminal result");
    const text = await readFile(markerPath, "utf8").catch(() => {
      throw new Error("The actual analyzer did not write its fixture observation.");
    });
    const marker = object(JSON.parse(text));
    const reportPath = marker.reportPath;
    assert.ok(typeof reportPath === "string" && isAbsolute(reportPath), "The analyzer must receive an absolute report filename");
    assert.ok(relative(project.root, reportPath).startsWith("../"), "The analyzer report must be outside the selected repository");
    const [reportExists, cacheExists, childStopped, analyzerStopped] = await Promise.all([
      exists(reportPath),
      exists(join(project.root, cacheDirectory)),
      stopped(marker.childPid),
      stopped(marker.analyzerPid),
    ]);
    return {
      ...observed, outcome, cacheExists, childStopped, analyzerStopped,
      privateReportRemoved: marker.privateReport === true && !reportExists,
      wroteReport: marker.wroteReport === true,
    };
  } finally {
    const released = await driver.invokeNative("depcruiser_release", job);
    assert.equal(released.status, "success", "The installed application must release the native analysis job");
  }
}

export async function updateInstalledSource(project: ImportFixture): Promise<void> {
  await writeFile(join(project.root, source), currentSource);
}

export async function restoreInstalledConfig(project: ImportFixture): Promise<void> {
  await writeFile(join(project.root, config), standardConfig);
}

export function reportFacts(observation: AnalysisObservation) {
  const { outcome } = observation;
  assert.equal(outcome.status, "completed", "The installed application must return a completed analysis");
  assert.equal(outcome.version, "18.7.2");
  assert.equal(outcome.workingDirectory, ".");
  const report = object(JSON.parse(outcome.reportJson));
  const modules = objects(report.modules);
  const entry = modules.find((module) => module.source === source);
  assert.ok(entry, "The analyzer report must include the TypeScript entry module");
  assert.ok(modules.some((module) => module.source === target), "The analyzer report must include the TypeScript target module");
  const summary = object(report.summary);
  const options = object(summary.optionsUsed);
  assert.equal(options.outputType, "json");
  assert.equal(options.baseDir, ".");
  return {
    importsTarget: objects(entry.dependencies).some((item) => item.resolved === target),
    ruleFinding: objects(summary.violations).some((item) => {
      const applied = object(item.rule);
      return applied.name === rule && applied.severity === "error" && item.from === source && item.to === target;
    }),
    cacheDisabled: options.cache === undefined || options.cache === false,
  };
}
