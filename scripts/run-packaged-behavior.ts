import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { access, mkdir, mkdtemp, open, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { arch, platform, release, tmpdir } from "node:os";
import { delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type BrowserServer } from "@playwright/test";

const checkout = await realpath(fileURLToPath(new URL("..", import.meta.url)));
const evidence = await mkdtemp(join(await evidenceRoot(), "run-"));
const children: ChildProcess[] = [];
let cancelledExitCode: number | undefined;
let cucumberProcess: ChildProcess | undefined;
let browserServer: BrowserServer | undefined;
let cancelTermTimer: ReturnType<typeof setTimeout> | undefined;
let cancelKillTimer: ReturnType<typeof setTimeout> | undefined;
let workDirectory: string | undefined;
const metadata: Record<string, unknown> = {
  startedAt: new Date().toISOString(),
  os: { platform: platform(), release: release(), arch: arch() },
  runner: { executable: process.execPath, runtime: "bun", version: Bun.version, nodeCompatibility: process.version },
  evidenceKind: "installed-release-external-webdriver",
};

async function evidenceRoot(): Promise<string> {
  const directory = join(checkout, "test-results", "packaged");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return directory;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required; see docs/change-requests/CR-001-native-acceptance.md`);
  return value;
}

async function executable(name: string, override?: string): Promise<string> {
  const candidates = override ? [override] : (process.env.PATH ?? "").split(delimiter).map((entry) => join(entry, name));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      if ((await stat(candidate)).isFile()) return realpath(candidate);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && ["ENOENT", "EACCES"].includes(String(error.code)))) throw error;
    }
  }
  throw new Error(`Required executable ${override ?? name} is unavailable or not executable`);
}

async function artifact(path: string): Promise<Record<string, unknown>> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  const info = await stat(path);
  return { path, sha256: hash.digest("hex"), bytes: info.size, modifiedAt: info.mtime.toISOString() };
}

function requireOutsideCheckout(path: string, label: string): void {
  const fromCheckout = relative(checkout, path);
  if (fromCheckout === "" || (!fromCheckout.startsWith(`..${sep}`) && fromCheckout !== ".." && !isAbsolute(fromCheckout))) {
    throw new Error(`${label} resolves inside the checkout; prepare an installed artifact outside the development checkout first`);
  }
}

async function packageVersion(path: string, name: string, expected: string): Promise<string> {
  const packagePath = await realpath(path);
  requireOutsideCheckout(packagePath, "Packaged fixture dependency");
  const value: unknown = JSON.parse(await readFile(packagePath, "utf8"));
  if (!value || typeof value !== "object" || !("name" in value) || value.name !== name || !("version" in value) || value.version !== expected) {
    throw new Error(`${packagePath} must identify ${name} ${expected}`);
  }
  return packagePath;
}

async function fixtureModules(): Promise<string | undefined> {
  const configured = process.env.CHOOM_PACKAGED_FIXTURE_MODULES;
  if (!configured) return undefined;
  if (!isAbsolute(configured)) throw new Error("CHOOM_PACKAGED_FIXTURE_MODULES must be an absolute node_modules directory outside the checkout");
  const modules = await realpath(configured);
  requireOutsideCheckout(modules, "CHOOM_PACKAGED_FIXTURE_MODULES");
  const analyzer = await packageVersion(join(modules, "dependency-cruiser", "package.json"), "dependency-cruiser", "18.7.2");
  const resolveFromAnalyzer = createRequire(analyzer).resolve;
  const parser = await packageVersion(resolveFromAnalyzer("typescript/package.json"), "@typescript/typescript6", "6.0.2");
  const parserEntry = await realpath(resolveFromAnalyzer("typescript"));
  requireOutsideCheckout(parserEntry, "TypeScript parser");
  await access(parserEntry, constants.R_OK);
  await access(join(modules, "dependency-cruiser", "bin", "dependency-cruiser.mjs"), constants.R_OK);
  metadata.fixtureDependencies = { modules, analyzer: { path: analyzer, version: "18.7.2" }, parser: { path: parser, entry: parserEntry, version: "6.0.2" } };
  return modules;
}

async function prerequisites() {
  if (platform() !== "linux") throw new Error(`Automated packaged acceptance supports Linux/X11 only; this host is ${platform()}. Use the documented manual installed-app route. This is not a passing or skipped run.`);
  if (!process.env.DISPLAY || process.env.XDG_SESSION_TYPE === "wayland") throw new Error("A working X11 DISPLAY is required. On headless Linux use xvfb-run; Wayland is not supported by this picker driver.");
  const requestedApp = required("CHOOM_PACKAGED_APP");
  if (!isAbsolute(requestedApp)) throw new Error("CHOOM_PACKAGED_APP must be an absolute path to an installed release executable");
  const app = await executable("Choom", requestedApp);
  requireOutsideCheckout(app, "CHOOM_PACKAGED_APP");
  const buildId = required("CHOOM_PACKAGED_BUILD_ID");
  await access(join(checkout, "dist", "index.html"), constants.R_OK).catch(() => {
    throw new Error("A production frontend build is required for the browser export viewer; run bun run build first");
  });
  const node = await executable("node");
  const nodeVersion = execFileSync(node, ["--version"], { encoding: "utf8", timeout: 5_000 }).trim();
  const expectedNode = `v${(await readFile(join(checkout, ".node-version"), "utf8")).trim()}`;
  if (nodeVersion !== expectedNode) throw new Error(`Node ${expectedNode} is required; found ${nodeVersion} at ${node}`);
  const tauri = await executable("tauri-driver", process.env.CHOOM_TAURI_DRIVER);
  const webkit = await executable("WebKitWebDriver", process.env.CHOOM_WEBKIT_DRIVER);
  const xdotool = await executable("xdotool", process.env.CHOOM_XDOTOOL);
  execFileSync(xdotool, ["getdisplaygeometry"], { timeout: 5_000, stdio: "pipe" });
  const runtimePath = process.env.CHOOM_PACKAGED_RUNTIME_PATH ?? "/usr/local/bin:/usr/bin:/bin";
  const modules = await fixtureModules();
  metadata.application = { ...await artifact(app), declaredBuildId: buildId };
  metadata.tools = { node: { path: node, version: nodeVersion }, tauri: await artifact(tauri), webkit: await artifact(webkit), xdotool: await artifact(xdotool) };
  metadata.productEnvironment = { path: runtimePath, display: process.env.DISPLAY, workingDirectory: workDirectory, gtkUsePortal: "0" };
  return { app, node, tauri, webkit, xdotool, runtimePath, modules };
}

async function ports(): Promise<[number, number, number, number, number]> {
  const servers = Array.from({ length: 5 }, () => createServer());
  try {
    const values = await Promise.all(servers.map((listener) => new Promise<number>((resolvePort, reject) => {
      listener.once("error", reject);
      listener.listen(0, "127.0.0.1", () => {
        const address = listener.address();
        if (address && typeof address !== "string") resolvePort(address.port);
        else reject(new Error("Could not reserve a local WebDriver port"));
      });
    })));
    const [driverPort, nativePort, previewPort, noRuntimeDriverPort, noRuntimeNativePort] = values;
    if (!driverPort || !nativePort || !previewPort || !noRuntimeDriverPort || !noRuntimeNativePort) {
      throw new Error("WebDriver and preview ports are required");
    }
    return [driverPort, nativePort, previewPort, noRuntimeDriverPort, noRuntimeNativePort];
  } finally {
    await Promise.all(servers.map((listener) => new Promise<void>((done) => listener.close(() => done()))));
  }
}

function launch(command: string, args: string[], options: Parameters<typeof spawn>[2]): ChildProcess {
  if (cancelledExitCode) throw new Error("Packaged execution was cancelled before process startup");
  const child = spawn(command, args, { ...options, detached: true });
  children.push(child);
  return child;
}

async function ready(child: ChildProcess, url: string, name: string): Promise<void> {
  let spawnError: Error | undefined;
  child.once("error", (error) => { spawnError = error; });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`${name} exited before becoming ready; inspect ${name}.log`);
    if (cancelledExitCode) throw new Error("Packaged setup was cancelled");
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch (error) {
      if (!(error instanceof Error)) throw error;
    }
    await delay(100);
  }
  throw new Error(`${name} did not become ready within 20 seconds; inspect ${name}.log`);
}

function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  try { process.kill(-child.pid, signal); }
  catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
  }
}

function cancel(signal: NodeJS.Signals): void {
  if (cancelledExitCode) {
    for (const child of children) signalGroup(child, "SIGKILL");
    return;
  }
  cancelledExitCode = signal === "SIGINT" ? 130 : 143;
  process.exitCode = cancelledExitCode;
  if (cucumberProcess?.exitCode === null && cucumberProcess.signalCode === null) {
    signalGroup(cucumberProcess, "SIGINT");
  } else {
    for (const child of children) signalGroup(child, "SIGTERM");
  }
  cancelTermTimer = setTimeout(() => { for (const child of children) signalGroup(child, "SIGTERM"); }, 5_000);
  cancelKillTimer = setTimeout(() => { for (const child of children) signalGroup(child, "SIGKILL"); }, 10_000);
}

async function cleanup(): Promise<void> {
  const failures: unknown[] = [];
  const closingBrowser = closeBrowserServer().catch((error: unknown) => { failures.push(error); });
  try {
    for (const child of children) signalGroup(child, "SIGTERM");
    const gracefulDeadline = Date.now() + 5_000;
    const running = () => children.some((child) => child.pid && child.exitCode === null && child.signalCode === null);
    while (running() && Date.now() < gracefulDeadline) await delay(50);
    for (const child of children) signalGroup(child, "SIGKILL");
    const deadline = Date.now() + 5_000;
    while (running()) {
      if (Date.now() >= deadline) throw new Error("An owned process did not exit after SIGKILL");
      await delay(50);
    }
  } catch (error) { failures.push(error); }
  await closingBrowser;
  try {
    if (workDirectory) await rm(workDirectory, { recursive: true, force: true });
  } catch (error) { failures.push(error); }
  if (failures.length) throw new AggregateError(failures, "Packaged resource cleanup failed");
}

async function closeBrowserServer(): Promise<void> {
  const server = browserServer;
  if (!server) return;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const forced = new Promise<void>((done, reject) => {
    killTimer = setTimeout(() => { void server.kill().then(done, reject); }, 5_000);
  });
  const deadline = new Promise<never>((_done, reject) => {
    deadlineTimer = setTimeout(() => reject(new Error("The owned Chromium server did not stop within 10 seconds")), 10_000);
  });
  try {
    const graceful = server.close().catch(async () => { await server.kill(); });
    await Promise.race([graceful, forced, deadline]);
  } finally {
    clearTimeout(killTimer);
    clearTimeout(deadlineTimer);
  }
}

function scenarioCount(report: unknown): number {
  if (!Array.isArray(report)) throw new Error("Cucumber did not produce a feature report");
  let count = 0;
  for (const feature of report) {
    if (!feature || typeof feature !== "object" || !Array.isArray(feature.elements)) continue;
    count += feature.elements.filter((element: unknown) => element && typeof element === "object"
      && "type" in element && element.type === "scenario").length;
  }
  if (!count) throw new Error("No packaged scenarios matched the selection; an empty run is not acceptance evidence");
  return count;
}

function cucumberArguments(): string[] {
  const args = process.argv.slice(2);
  const selected: string[] = [];
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!value || (option !== "--tags" && option !== "--name")) throw new Error("Only --tags <expression> and --name <expression> are supported");
    selected.push(option, option === "--tags" ? `@packaged and (${value})` : value);
  }
  return selected;
}

process.on("SIGINT", cancel);
process.on("SIGTERM", cancel);
try {
  if (process.argv.includes("--help")) {
    console.log("Usage: bun scripts/run-packaged-behavior.ts [--tags expression] [--name expression]\nRequires Linux/X11, CHOOM_PACKAGED_APP, CHOOM_PACKAGED_BUILD_ID, pinned Node, tauri-driver, WebKitWebDriver, xdotool, and a production frontend build. See docs/change-requests/CR-001-native-acceptance.md.");
    metadata.outcome = "help";
  } else {
    const selected = cucumberArguments();
    workDirectory = await mkdtemp(join(tmpdir(), "choom-packaged-"));
    const setup = await prerequisites();
    const [driverPort, nativePort, previewPort, noRuntimeDriverPort, noRuntimeNativePort] = await ports();
    const noRuntimePath = join(workDirectory, "no-analyzer-runtime");
    await mkdir(noRuntimePath, { mode: 0o700 });
    metadata.noRuntimeProductEnvironment = {
      path: noRuntimePath, display: process.env.DISPLAY, workingDirectory: workDirectory, gtkUsePortal: "0",
    };
    const log = await open(join(evidence, "tauri-driver.log"), "w", 0o600);
    const noRuntimeLog = await open(join(evidence, "no-runtime-tauri-driver.log"), "w", 0o600);
    const previewLog = await open(join(evidence, "preview.log"), "w", 0o600);
    try {
      for (const product of [
        { port: driverPort, nativePort, path: setup.runtimePath, log, name: "tauri-driver" },
        { port: noRuntimeDriverPort, nativePort: noRuntimeNativePort, path: noRuntimePath, log: noRuntimeLog, name: "no-runtime-tauri-driver" },
      ]) {
        const driver = launch(setup.tauri, ["--port", String(product.port), "--native-port", String(product.nativePort), "--native-host", "127.0.0.1", "--native-driver", setup.webkit], {
          cwd: workDirectory, env: { ...process.env, PATH: product.path, GTK_USE_PORTAL: "0" }, stdio: ["ignore", product.log.fd, product.log.fd],
        });
        await ready(driver, `http://127.0.0.1:${product.port}/status`, product.name);
      }
      const baseUrl = `http://127.0.0.1:${previewPort}`;
      const previewProcess = launch(setup.node, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", String(previewPort), "--strictPort"], {
        cwd: checkout, stdio: ["ignore", previewLog.fd, previewLog.fd], env: { ...process.env, CI: "true" },
      });
      await ready(previewProcess, baseUrl, "preview");
      browserServer = await chromium.launchServer({
        host: "127.0.0.1", headless: true, timeout: 20_000,
        handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
        downloadsPath: join(workDirectory, "downloads"), artifactsDir: join(workDirectory, "browser-artifacts"),
        env: { ...process.env, TMPDIR: workDirectory, TMP: workDirectory, TEMP: workDirectory },
      });
      metadata.browserViewer = { baseUrl, processId: browserServer.process().pid, source: resolve(checkout, "dist"), index: await artifact(join(checkout, "dist", "index.html")) };
      const cucumber = launch(setup.node, ["node_modules/@cucumber/cucumber/bin/cucumber.js", "--config", "cucumber.mjs", "--profile", "packaged", "--format", `json:${join(evidence, "cucumber.json")}`, ...selected], {
        cwd: checkout, stdio: "inherit", env: {
          ...process.env, CHOOM_BASE_URL: baseUrl, CHOOM_PACKAGED_APP: setup.app,
          TMPDIR: workDirectory, TMP: workDirectory, TEMP: workDirectory,
          CHOOM_PACKAGED_DRIVER_PORT: String(driverPort), CHOOM_XDOTOOL: setup.xdotool,
          CHOOM_PACKAGED_NO_RUNTIME_DRIVER_PORT: String(noRuntimeDriverPort), CHOOM_PACKAGED_NO_RUNTIME_PATH: noRuntimePath,
          CHOOM_PACKAGED_EVIDENCE_DIR: evidence,
          CHOOM_PACKAGED_FIXTURE_MODULES: setup.modules,
          CHOOM_PACKAGED_BROWSER_ENDPOINT: browserServer.wsEndpoint(),
        },
      });
      cucumberProcess = cucumber;
      const result = await new Promise<number>((done, reject) => {
        cucumber.once("error", reject);
        cucumber.once("exit", (code) => done(code ?? 1));
      });
      if (!cancelledExitCode) metadata.scenarios = scenarioCount(JSON.parse(await readFile(join(evidence, "cucumber.json"), "utf8")));
      const setupFailure = await readFile(join(evidence, "setup-failure.json"), "utf8").catch((error: unknown) => {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
        throw error;
      });
      process.exitCode = cancelledExitCode ?? (setupFailure ? 2 : result);
      metadata.outcome = setupFailure ? "setup-failed" : result === 0 ? "passed" : "scenario-failed";
      if (setupFailure) metadata.setupFailure = JSON.parse(setupFailure);
    } finally { await log.close(); await noRuntimeLog.close(); await previewLog.close(); }
  }
} catch (error) {
  process.exitCode = cancelledExitCode ?? 2;
  metadata.outcome = "setup-failed";
  metadata.reason = error instanceof Error ? error.message : String(error);
  console.error(`Packaged setup failed: ${String(metadata.reason)}`);
} finally {
  clearTimeout(cancelTermTimer);
  clearTimeout(cancelKillTimer);
  try { await cleanup(); }
  catch (error) {
    metadata.cleanupFailure = error instanceof AggregateError ? error.errors.map(String).join("; ") : String(error);
    metadata.outcome = "cleanup-failed";
    process.exitCode = 2;
    console.error(`Packaged cleanup failed: ${String(metadata.cleanupFailure)}`);
  }
  if (cancelledExitCode) { process.exitCode = cancelledExitCode; metadata.outcome = "cancelled"; }
  metadata.exitCode = process.exitCode ?? 0;
  const ownedProcesses = browserServer ? [...children, browserServer.process()] : children;
  metadata.processes = ownedProcesses.map((child) => ({ pid: child.pid, exitCode: child.exitCode, signal: child.signalCode }));
  metadata.finishedAt = new Date().toISOString();
  await writeFile(join(evidence, "run.json"), JSON.stringify(metadata, null, 2));
  console.log(`Packaged evidence: ${evidence}`);
  process.off("SIGINT", cancel);
  process.off("SIGTERM", cancel);
}
