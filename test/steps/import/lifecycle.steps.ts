import { After, Before, BeforeStep, Status } from "@cucumber/cucumber";
import { ImportFixture } from "../../support/import/fixtures.ts";
import { BrowserImportDriver } from "../../support/import/browser-driver.ts";
import { PackagedImportDriver } from "../../support/import/packaged-driver.ts";
import type { ImportWorld } from "../../support/import/world.ts";

Before({ tags: "@cr-001", timeout: 60_000 }, async function (this: ImportWorld, { pickle }) {
  this.importFixture = await ImportFixture.create();
  this.desktopImport = pickle.tags.some((tag) => tag.name === "@desktop-ui");
  this.controlledImport = [
    "Cancellation still applies after analysis completes", "A cancelled result cannot replace a newer diagram",
    "Failure before display preserves the current diagram",
  ].includes(pickle.name);
  if (pickle.tags.some((tag) => tag.name === "@packaged")) {
    this.installedDriver = new PackagedImportDriver(this);
    this.importDriver = this.installedDriver;
  } else if (pickle.tags.some((tag) => tag.name === "@browser")) {
    this.importDriver = new BrowserImportDriver(this);
  }
});

BeforeStep({ tags: "@cr-001" }, function (this: ImportWorld, { pickleStep }) {
  this.stepKind = pickleStep.type;
});

After({ tags: "@cr-001", timeout: 60_000 }, async function (this: ImportWorld, { result }) {
  try {
    await this.attach(JSON.stringify(this.importFixture?.controls.report() ?? [], null, 2), "application/json");
    if (result?.status === Status.PASSED) {
      if (this.importDriver instanceof BrowserImportDriver) this.importDriver.assertValidCalls();
      this.importFixture?.controls.assertObserved();
    }
  } finally {
    try {
      if (this.importDriver instanceof BrowserImportDriver) await this.importDriver.close();
      await this.releaseDocumentSnapshots?.();
    } finally {
      try {
        await this.viewerBrowser?.close();
        if (this.installedDriver instanceof PackagedImportDriver) await this.installedDriver.close();
      } finally {
        await this.importFixture?.close();
      }
    }
  }
});
