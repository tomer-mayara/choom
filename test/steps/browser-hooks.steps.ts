import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  After,
  Before,
  Status,
  type World,
} from "@cucumber/cucumber";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

interface WorkspaceWorld extends World {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  pageErrors: string[];

}

Before(
  { tags: "@browser", timeout: 30_000 },
  async function (this: WorkspaceWorld) {
    this.pageErrors = [];
    this.browser = await chromium.launch();
    this.context = await this.browser.newContext();
    await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    this.page = await this.context.newPage();
    this.page.on("pageerror", (error) => this.pageErrors.push(error.message));
  },
);

After(
  { tags: "@browser", timeout: 30_000 },
  async function (this: WorkspaceWorld, { pickle, result }) {
    try {
      if (result?.status === Status.FAILED && this.context) {
        const directory = join("test-results", randomUUID());
        await mkdir(directory, { recursive: true });
        const captures = await Promise.allSettled([
          this.page?.screenshot({ path: join(directory, "failure.png"), fullPage: true }),
          this.context.tracing.stop({ path: join(directory, "trace.zip") }),
        ]);
        console.error(`Browser failure artifacts for "${pickle.name}": ${directory}`);
        for (const capture of captures) {
          if (capture.status === "rejected") {
            console.error(`Could not capture browser diagnostic: ${String(capture.reason)}`);
          }
        }
      } else {
        await this.context?.tracing.stop();
      }
    } finally {
      await this.browser?.close();
    }
  },
);
