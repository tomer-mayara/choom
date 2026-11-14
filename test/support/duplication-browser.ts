import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { World } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import { parse } from "yaml";
import type { Baseline, DuplicationReport } from "../../src/domain/generated/contracts.ts";
import { BaselineBrowserDriver } from "./baseline-viewer/browser-driver.ts";

export interface DuplicationWorld extends World {
  page?: Page;
  duplicationDirectory?: string;
  duplicationBaseline?: string;
  duplicationReport?: string;
  duplicationOriginals?: [Buffer, Buffer];
  duplicationData?: { baseline: Baseline; report: DuplicationReport };
  duplicationViewer?: BaselineBrowserDriver;
}

export async function prepareDuplicationFiles(world: DuplicationWorld) {
  assert.ok(world.page);
  world.duplicationDirectory = await mkdtemp(join(tmpdir(), "choom-duplication-"));
  world.duplicationBaseline = join(world.duplicationDirectory, "baseline.yaml");
  world.duplicationReport = join(world.duplicationDirectory, "review.yaml");
  await copyFile(new URL("../fixtures/interface-duplication/producer-baseline.yaml", import.meta.url), world.duplicationBaseline);
  await copyFile(new URL("../fixtures/interface-duplication/producer-review.yaml", import.meta.url), world.duplicationReport);
  world.duplicationOriginals = await Promise.all([readFile(world.duplicationBaseline), readFile(world.duplicationReport)]);
  world.duplicationData = {
    baseline: parse(world.duplicationOriginals[0].toString("utf8")) as Baseline,
    report: parse(world.duplicationOriginals[1].toString("utf8")) as DuplicationReport,
  };
  world.duplicationViewer = new BaselineBrowserDriver(world.page);
  await world.duplicationViewer.open();
}

export function publishedFinding(world: DuplicationWorld) {
  const finding = world.duplicationData?.report.findings.find((item) => item.status === "potential-redundancy" && item.overlap);
  assert.ok(finding, "The published fixture must contain a supported overlap.");
  return finding;
}

export function publishedEntry(world: DuplicationWorld) {
  const finding = publishedFinding(world);
  const observationIndex = finding.observations.findIndex((observation) => observation.endpoints[0]?.entryId);
  const endpoint = finding.observations[observationIndex]?.endpoints[0];
  const baseline = world.duplicationData?.baseline;
  assert.ok(endpoint?.entryId && baseline?.formatVersion === 2);
  const item = baseline.interfaces.find(({ id }) => id === endpoint.interfaceId);
  const entry = item?.documentation?.entries.find(({ id }) => id === endpoint.entryId);
  assert.ok(item && entry);
  return { finding, endpoint, item, entry, observationIndex };
}

export async function selectDuplicationReport(page: Page, path: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open duplication report", exact: true }).click();
  await (await chooser).setFiles(path);
}

export async function openPublishedAssessment(world: DuplicationWorld) {
  assert.ok(world.page && world.duplicationViewer && world.duplicationBaseline && world.duplicationReport && world.duplicationData);
  await world.duplicationViewer.openBaseline(world.duplicationBaseline);
  await expect(world.page.getByRole("heading", { name: world.duplicationData.baseline.id, exact: true })).toBeVisible();
  const duplicates = world.page.getByRole("button", { name: "Duplicates", exact: true });
  await expect(duplicates).toBeVisible({ timeout: 2_000 });
  await duplicates.click();
  await selectDuplicationReport(world.page, world.duplicationReport);
  await expect(world.page.locator(`[data-finding-id="${publishedFinding(world).id}"]`)).toBeVisible();
}

export async function comparePublishedFinding(world: DuplicationWorld) {
  assert.ok(world.page);
  await world.page.locator(`[data-finding-id="${publishedFinding(world).id}"]`).click();
  await expect(world.page.getByRole("dialog", { name: "Duplicate comparison", exact: true })).toBeVisible();
}

export async function inspectPublishedEntry(world: DuplicationWorld) {
  assert.ok(world.page);
  await world.page.getByRole("button", { name: `Inspect A observation ${publishedEntry(world).observationIndex + 1}`, exact: true }).click();
  await expect(world.page.getByRole("dialog", { name: "Interface details", exact: true })).toBeVisible();
}
