import { preview } from "vite";

let cucumber: ReturnType<typeof Bun.spawn> | undefined;
let cancelledExitCode: number | undefined;

// A private port prevents these scenarios from using an unrelated dev server.
const server = await preview({
  preview: { host: "127.0.0.1", port: 0, strictPort: true, open: false },
  plugins: [{
    name: "close-browser-behavior",
    async closePreviewServer() {
      if (cucumber && cucumber.exitCode === null) {
        // Playwright handles SIGINT by closing Chromium before exiting.
        cucumber.kill("SIGINT");
        // A second interrupt makes Playwright force-close a stuck browser.
        const forceClose = setTimeout(() => cucumber?.kill("SIGINT"), 5_000);
        const forceExit = setTimeout(() => cucumber?.kill("SIGKILL"), 10_000);
        try {
          await cucumber.exited;
        } finally {
          clearTimeout(forceClose);
          clearTimeout(forceExit);
        }
      }
    },
  }],
});

function cancel(signal: NodeJS.Signals): void {
  cancelledExitCode ??= signal === "SIGINT" ? 130 : 143;
  process.exitCode = cancelledExitCode;
  // Vite also handles SIGTERM. Its close hook must await the child before exit.
  void server.close().catch((error: unknown) => console.error(error));
}

process.prependListener("SIGINT", cancel);
process.prependListener("SIGTERM", cancel);

try {
  const baseUrl = server.resolvedUrls?.local[0];
  if (!baseUrl) throw new Error("The production preview has no local URL");
  cucumber = Bun.spawn(
    ["node", "node_modules/@cucumber/cucumber/bin/cucumber.js", "--config", "cucumber.mjs", "--profile", "browser", ...process.argv.slice(2)],
    {
      env: { ...process.env, CHOOM_BASE_URL: baseUrl },
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const exitCode = await cucumber.exited;
  process.exitCode = cancelledExitCode ?? exitCode;
} finally {
  await server.close();
  process.off("SIGINT", cancel);
  process.off("SIGTERM", cancel);
}
