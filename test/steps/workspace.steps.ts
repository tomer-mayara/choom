import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  After,
  Before,
  Given,
  Status,
  Then,
  When,
  type World,
} from "@cucumber/cucumber";
import {
  chromium,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

interface WorkspaceWorld extends World {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  pageErrors: string[];
  picker?: {
    resolve: (directory: string | null) => void;
    reject: (error: Error) => void;
  };
}

function workspacePage(world: WorkspaceWorld): Page {
  if (!world.page) throw new Error("The browser workspace is not open");
  return world.page;
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

Given(
  "the desktop workspace uses a simulated native picker",
  { timeout: 30_000 },
  async function (this: WorkspaceWorld) {
    const page = workspacePage(this);
    await page.exposeFunction("__choomDialog", (command: string) => {
      expect(command).toBe("plugin:dialog|open");
      return new Promise<string | null>((resolve, reject) => {
        this.picker = { resolve, reject };
      });
    });
    await page.addInitScript(() => {
      const host = globalThis as typeof globalThis & {
        __choomDialog: (command: string) => Promise<string | null>;
      };
      Object.defineProperty(host, "isTauri", { value: true });
      Object.defineProperty(host, "__TAURI_INTERNALS__", {
        value: { invoke: (command: string) => host.__choomDialog(command) },
      });
    });
    await page.goto(process.env.CHOOM_BASE_URL ?? "http://127.0.0.1:1420");
  },
);

Given(
  "the browser workspace is open",
  { timeout: 30_000 },
  async function (this: WorkspaceWorld) {
    await workspacePage(this).goto(
      process.env.CHOOM_BASE_URL ?? "http://127.0.0.1:1420",
    );
  },
);

Then(
  "the interface connects to the model and desktop",
  { timeout: 15_000 },
  async function (this: WorkspaceWorld) {
    const diagram = workspacePage(this).getByLabel("Example architecture diagram");
    await expect(diagram.getByRole("group", { name: "Edge from ui to domain", exact: true })).toBeVisible();
    await expect(diagram.getByRole("group", { name: "Edge from ui to desktop", exact: true })).toBeVisible();
  },
);

Then(
  "the browser workspace identifies itself",
  async function (this: WorkspaceWorld) {
    const page = workspacePage(this);
    await expect(
      page.getByRole("heading", { name: "Architecture starts here." }),
    ).toBeVisible();
    await expect(page.getByText("Browser", { exact: true })).toBeVisible();
  },
);

Then(
  "the directory picker action is absent",
  async function (this: WorkspaceWorld) {
    await expect(
      workspacePage(this).getByRole("button", { name: "Choose directory" }),
    ).toHaveCount(0);
  },
);

Then("the example is closed", async function (this: WorkspaceWorld) {
  const page = workspacePage(this);
  await expect(
    page.getByRole("button", { name: "Explore example" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Example architecture", { exact: true })).toBeHidden();
  await expect(page.getByLabel("Example architecture diagram")).toHaveCount(0);
});

When("I explore the example", async function (this: WorkspaceWorld) {
  await workspacePage(this)
    .getByRole("button", { name: "Explore example" })
    .click();
});

Then(
  "the starter diagram is visible",
  { timeout: 30_000 },
  async function (this: WorkspaceWorld) {
    const page = workspacePage(this);
    await expect(
      page.getByRole("button", { name: "Close example" }),
    ).toHaveAttribute("aria-expanded", "true");
    const diagram = page.getByLabel("Example architecture diagram");
    await expect(diagram).toBeVisible();
    for (const label of ["React interface", "Architecture model", "Tauri desktop"]) {
      await expect(diagram.getByText(label, { exact: true })).toBeVisible();
    }
  },
);

When("I close the example", async function (this: WorkspaceWorld) {
  await workspacePage(this)
    .getByRole("button", { name: "Close example" })
    .click();
});

Then("no browser page errors have occurred", function (this: WorkspaceWorld) {
  expect(this.pageErrors).toEqual([]);
});

Then("the desktop directory action is available", async function (this: WorkspaceWorld) {
  const page = workspacePage(this);
  await expect(page.getByText("Desktop", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose directory" })).toBeEnabled();
});

When("I request a directory", async function (this: WorkspaceWorld) {
  await workspacePage(this).getByRole("button", { name: "Choose directory" }).click();
  await expect.poll(() => Boolean(this.picker)).toBe(true);
});

Then("the directory action is disabled while the picker is pending", async function (this: WorkspaceWorld) {
  expect(this.picker).toBeDefined();
  await expect(workspacePage(this).getByRole("button", { name: "Choose directory" })).toBeDisabled();
});

function respondToPicker(world: WorkspaceWorld, result: string | null | Error): void {
  const picker = world.picker;
  if (!picker) throw new Error("No directory request is pending");
  world.picker = undefined;
  if (result instanceof Error) picker.reject(result);
  else picker.resolve(result);
}

When("the simulated picker selects {string}", function (this: WorkspaceWorld, directory: string) {
  respondToPicker(this, directory);
});

When("the simulated picker is cancelled", function (this: WorkspaceWorld) {
  respondToPicker(this, null);
});

When("the simulated picker fails", function (this: WorkspaceWorld) {
  respondToPicker(this, new Error("Native picker unavailable"));
});

Then("the workspace shows directory {string}", async function (this: WorkspaceWorld, directory: string) {
  await expect(workspacePage(this).getByRole("status")).toHaveText(`Selected directory: ${directory}`);
});

Then("the workspace reports the directory picker failure", async function (this: WorkspaceWorld) {
  await expect(workspacePage(this).getByRole("alert")).toHaveText(
    "The directory picker could not be opened. Please try again.",
  );
});

Then("no directory picker error is shown", async function (this: WorkspaceWorld) {
  await expect(workspacePage(this).getByRole("alert")).toHaveCount(0);
});
