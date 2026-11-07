import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, preview, type PreviewServer } from "vite";

let cucumber: ReturnType<typeof Bun.spawn> | undefined;
let cancelledExitCode: number | undefined;
const servers: PreviewServer[] = [];
let controlledOutput: string | undefined;

async function stopCucumber(): Promise<void> {
  if (!cucumber || cucumber.exitCode !== null) return;
  // Playwright handles SIGINT by closing Chromium before exiting.
  cucumber.kill("SIGINT");
  const forceClose = setTimeout(() => cucumber?.kill("SIGINT"), 5_000);
  const forceExit = setTimeout(() => cucumber?.kill("SIGKILL"), 10_000);
  try { await cucumber.exited; }
  finally { clearTimeout(forceClose); clearTimeout(forceExit); }
}

function cancel(signal: NodeJS.Signals): void {
  cancelledExitCode ??= signal === "SIGINT" ? 130 : 143;
  process.exitCode = cancelledExitCode;
  // Vite also handles SIGTERM. Its close hook must await the child before exit.
  void Promise.all(servers.map((server) => server.close())).catch((error: unknown) => console.error(error));
}

process.prependListener("SIGINT", cancel);
process.prependListener("SIGTERM", cancel);

async function run(): Promise<void> {
  controlledOutput = await mkdtemp(join(tmpdir(), "choom-browser-controls-"));
  if (cancelledExitCode !== undefined) return;
  // Only layout-controlled scenarios use this composition; dist stays the shipped app.
  await build({
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    build: {
      outDir: controlledOutput,
      emptyOutDir: true,
      rolldownOptions: { input: fileURLToPath(new URL("../test/browser/index.html", import.meta.url)) },
    },
  });
  if (cancelledExitCode !== undefined) return;
  const controlledServer = await preview({
    configFile: false,
    build: { outDir: controlledOutput },
    preview: { host: "127.0.0.1", port: 0, strictPort: true, open: false },
  });
  servers.push(controlledServer);
  if (cancelledExitCode !== undefined) return;
  // Private ports prevent these scenarios from using an unrelated dev server.
  const server = await preview({
    preview: { host: "127.0.0.1", port: 0, strictPort: true, open: false },
    plugins: [{ name: "close-browser-behavior", closePreviewServer: stopCucumber }],
  });
  servers.push(server);
  if (cancelledExitCode !== undefined) return;
  const baseUrl = server.resolvedUrls?.local[0];
  const controlledBaseUrl = controlledServer.resolvedUrls?.local[0];
  if (!baseUrl) throw new Error("The production preview has no local URL");
  if (!controlledBaseUrl) throw new Error("The controlled preview has no local URL");
  cucumber = Bun.spawn(
    ["node", "node_modules/@cucumber/cucumber/bin/cucumber.js", "--config", "cucumber.mjs", "--profile", "browser", ...process.argv.slice(2)],
    {
      env: { ...process.env, CHOOM_BASE_URL: baseUrl, CHOOM_CONTROLLED_URL: new URL("test/browser/index.html", controlledBaseUrl).href },
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const exitCode = await cucumber.exited;
  process.exitCode = cancelledExitCode ?? exitCode;
}

try {
  await run();
} finally {
  try { await Promise.all(servers.map((server) => server.close())); }
  finally {
    if (controlledOutput) await rm(controlledOutput, { recursive: true, force: true });
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
}
