import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "@playwright/test";
import { parse } from "yaml";
import { object, objects, type Data } from "./fixtures.ts";
import { driver, fixture, type ImportWorld } from "./world.ts";

export async function loadRepository(world: ImportWorld): Promise<void> {
  const input = fixture(world);
  await input.materialize();
  if (world.installedDriver && input.facts.permissionDenied) await input.denyManifestRead();
  if (world.desktopImport && !world.installedDriver) {
    input.controls.require("repository-fixture-delivered");
    if (input.hasRecordedAnalysis()) input.controls.require("recorded-report-delivered");
    if (input.facts.execution || input.facts.missingPrerequisite) input.controls.require("execution-condition-delivered");
  }
  world.actualDocument = undefined;
  world.exportedPath = undefined;
  await driver(world).loadRepository(fixture(world).root);
}

export function startExport(world: ImportWorld): void {
  world.exportSettled = false;
  world.exportOperation = driver(world).exportDocument(fixture(world).destination).then(
    (value) => ({ status: "fulfilled" as const, value }), (reason: unknown) => ({ status: "rejected" as const, reason }),
  ).finally(() => { world.exportSettled = true; });
}

export async function openSaved(world: ImportWorld, name?: string): Promise<void> {
  const path = await fixture(world).writeDocument(name);
  if (world.desktopImport && !world.installedDriver) fixture(world).controls.require("saved-document-delivered");
  world.actualDocument = undefined;
  world.exportedPath = undefined;
  await driver(world).openDocument(path);
}

export async function exportCurrent(world: ImportWorld): Promise<string> {
  const destination = join(fixture(world).directory, `export-${randomUUID()}.choom.yaml`);
  world.exportedPath = await driver(world).exportDocument(destination);
  return world.exportedPath;
}

export async function actualDocument(world: ImportWorld): Promise<Data> {
  if (!world.actualDocument) {
    const path = world.exportedPath ?? await exportCurrent(world);
    world.actualDocument = object(parse(await readFile(path, "utf8")));
  }
  return world.actualDocument;
}

export async function showNamed(world: ImportWorld, name: string): Promise<void> {
  await openSaved(world, name);
  await expect.poll(async () => (await driver(world).view()).text).toContain(name);
}

export async function expectComponents(world: ImportWorld, ids: string[]): Promise<void> {
  await expect.poll(async () => (await driver(world).view()).componentIds.toSorted()).toEqual(ids.toSorted());
}

export async function expectEdge(world: ImportWorld, source: string, target: string): Promise<void> {
  await expect.poll(async () => (await driver(world).view()).edges).toContainEqual({ source, target });
}

export async function expectFailure(world: ImportWorld, reason: string): Promise<void> {
  await expect.poll(async () => (await driver(world).view()).alerts.join(" ").toLowerCase()).toContain(reason.toLowerCase());
}

export async function relationship(world: ImportWorld, source?: string, target?: string): Promise<Data> {
  const edges = objects((await actualDocument(world)).relationships);
  const matches = source === undefined ? edges : edges.filter((edge) => edge.source === source && edge.target === target);
  assert.equal(matches.length, 1);
  const edge = matches[0];
  assert.ok(edge);
  return edge;
}

export async function diagnostics(world: ImportWorld): Promise<Data[]> {
  return objects((await actualDocument(world)).diagnostics);
}

export async function expectRoles(world: ImportWorld, source: string, target: string): Promise<void> {
  const findings = await diagnostics(world);
  const matching = findings.find((finding) => {
    const subjects = objects(finding.subjects);
    return subjects.some((subject) => subject.role === "source" && subject.value === source)
      && subjects.some((subject) => subject.role === "target" && subject.value === target);
  });
  assert.ok(matching, `An actual exported finding must retain source ${source} and target ${target}`);
}
