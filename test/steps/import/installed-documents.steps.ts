import assert from "node:assert/strict";
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { Given, Then, When } from "@cucumber/cucumber";
import { DepCruiserArchitecturalLayer } from "../../../src/architecture/dependency-cruiser/architectural-layer.ts";
import { DepCruiserReportConverter } from "../../../src/architecture/dependency-cruiser/converter.ts";
import { DesktopDepCruiserRunner } from "../../../src/architecture/dependency-cruiser/runner.ts";
import { RepositoryDiscovery } from "../../../src/architecture/repository-discovery.ts";
import type { ArchitectureDocument } from "../../../src/domain/generated/contracts.ts";
import { DocumentFiles } from "../../../src/documents/document-files.ts";
import { encodeArchitectureYaml } from "../../../src/lib/architecture-yaml.ts";
import { DesktopAnalyzerAccess } from "../../../src/platform/analyzer.ts";
import { DesktopDocumentAccess } from "../../../src/platform/documents.ts";
import type { CreateDocumentSnapshotOutcome, ExportDocumentOutcome } from "../../../src/platform/generated/contracts.ts";
import { DesktopRepositoryAccess } from "../../../src/platform/repository.ts";
import { architectureDocumentFixture } from "../../support/document-fixtures.ts";
import { installFixtureDependencies } from "../../support/import/installed-fixture.ts";
import { PackagedImportDriver } from "../../support/import/packaged-driver.ts";
import { fixture, type ImportWorld } from "../../support/import/world.ts";

interface InstalledDocumentsWorld extends ImportWorld {
  documentAccess?: DesktopDocumentAccess;
  snapshots?: string[];
  currentSnapshot?: string;
  candidateSnapshot?: string;
  releasedSnapshot?: string;
  originalArchitecture?: ArchitectureDocument;
  reopenedArchitecture?: ArchitectureDocument;
  snapshotOutcome?: CreateDocumentSnapshotOutcome;
  exportOutcome?: ExportDocumentOutcome;
}

function transport(world: InstalledDocumentsWorld) {
  const driver = world.installedDriver;
  assert.ok(driver instanceof PackagedImportDriver);
  return (command: string, args: { request: unknown }): Promise<unknown> => driver.invokeNative(command, args.request);
}

function documents(world: InstalledDocumentsWorld): DesktopDocumentAccess {
  world.documentAccess ??= new DesktopDocumentAccess(transport(world), () => true);
  world.snapshots ??= [];
  world.releaseDocumentSnapshots ??= async () => {
    for (const id of [...world.snapshots ?? []]) await releaseSnapshot(world, id);
  };
  return world.documentAccess;
}

function encoded(name: string): string {
  const result = encodeArchitectureYaml(architectureDocumentFixture(name));
  assert.ok(result.status === "success", JSON.stringify(result));
  return result.text;
}

async function createSnapshot(world: InstalledDocumentsWorld, name: string): Promise<string> {
  const result = await documents(world).createDocumentSnapshot({ text: encoded(name) });
  assert.ok(result.status === "success", JSON.stringify(result));
  world.snapshots?.push(result.snapshotId);
  return result.snapshotId;
}

async function releaseSnapshot(world: InstalledDocumentsWorld, snapshotId: string): Promise<void> {
  const result = await documents(world).releaseDocumentSnapshot({ snapshotId });
  assert.ok(result.status === "success", JSON.stringify(result));
  world.snapshots = world.snapshots?.filter((id) => id !== snapshotId);
}

Given("an installed repository declares one workspace component for two source directories",
  { timeout: 60_000 }, async function (this: InstalledDocumentsWorld) {
    const project = fixture(this);
    project.declare([".", "src", "packages/core"]);
    project.import("src/components/panel.ts", "packages/core/model/entity.ts");
    project.import("src/lib/format.ts", "packages/core/model/entity.ts");
    await installFixtureDependencies(project);
    await project.materialize();
  });

When("the installed application analyzes it and exports its architecture",
  { timeout: 60_000 }, async function (this: InstalledDocumentsWorld) {
    const project = fixture(this);
    const native = transport(this);
    const repository = new DesktopRepositoryAccess(native, () => true);
    const discovered = await new RepositoryDiscovery(repository).discover({ rootPath: project.root });
    assert.ok(discovered.status === "success", JSON.stringify(discovered));
    const { repositorySession, components, analysis } = discovered.repository;
    try {
      const layer = new DepCruiserArchitecturalLayer(
        new DesktopDepCruiserRunner(new DesktopAnalyzerAccess(native, () => true, () => undefined)),
        new DepCruiserReportConverter(repository),
      );
      const result = await layer.analyze({ repositorySession, components, analysis }, {
        signal: new AbortController().signal, onProgress: () => {},
      });
      assert.ok(result.status === "success", JSON.stringify(result));
      this.originalArchitecture = result.document;
    } finally {
      const closed = await repository.closeRepository({ repositorySession });
      assert.ok(closed.status === "success", JSON.stringify(closed));
    }
    const files = new DocumentFiles(documents(this));
    const candidate = await files.prepareCandidate(this.originalArchitecture);
    assert.ok(candidate.status === "success", JSON.stringify(candidate));
    this.snapshots?.push(candidate.snapshotId);
    const exported = await files.exportDocument(candidate.document, async () => ({ path: project.destination, overwrite: false }));
    assert.ok(exported.status === "success", JSON.stringify(exported));
    await rm(project.root, { recursive: true, force: true });
    const reopened = await files.openSavedFile(project.destination);
    assert.ok(reopened.status === "success", JSON.stringify(reopened));
    this.reopenedArchitecture = reopened.document;
    await releaseSnapshot(this, candidate.snapshotId);
    this.releasedSnapshot = candidate.snapshotId;
  });

Then("the reopened architecture preserves its declared components and both file pairs", async function (this: InstalledDocumentsWorld) {
  const document = this.reopenedArchitecture;
  assert.ok(document);
  assert.deepEqual(document, this.originalArchitecture);
  assert.deepEqual(document.components.map(({ id }) => id), [".", "packages/core", "src"]);
  assert.deepEqual(document.relationships.map(({ source, target }) => [source, target]), [["src", "packages/core"]]);
  assert.deepEqual(document.relationships[0]?.evidence.map(({ sourceFile, targetFile }) => [sourceFile, targetFile]), [
    ["src/components/panel.ts", "packages/core/model/entity.ts"],
    ["src/lib/format.ts", "packages/core/model/entity.ts"],
  ]);
  assert.equal((await readFile(fixture(this).destination, "utf8")).includes(fixture(this).root), false);
});

Then("the source repository is no longer available", async function (this: InstalledDocumentsWorld) {
  await assert.rejects(access(fixture(this).root), { code: "ENOENT" });
});

Then("its released candidate is no longer available", async function (this: InstalledDocumentsWorld) {
  assert.ok(this.releasedSnapshot);
  const result = await documents(this).readDocumentSnapshot({ snapshotId: this.releasedSnapshot });
  assert.ok(result.status === "failure");
  assert.equal(result.code, "invalid-snapshot");
});

Given("an existing export contains architecture {string}", async function (this: InstalledDocumentsWorld, name: string) {
  const text = encoded(name);
  fixture(this).facts.originalDestination = text;
  await writeFile(fixture(this).destination, text);
});

When("the installed application exports {string} without replacement consent",
  async function (this: InstalledDocumentsWorld, name: string) {
    this.exportOutcome = await documents(this).exportDocument({ path: fixture(this).destination, text: encoded(name), overwrite: false });
  });

Then("the export reports that the destination already exists", function (this: InstalledDocumentsWorld) {
  assert.ok(this.exportOutcome?.status === "failure");
  assert.equal(this.exportOutcome.code, "destination-exists");
});

Given("the installed application retains a current snapshot and a candidate", async function (this: InstalledDocumentsWorld) {
  this.currentSnapshot = await createSnapshot(this, "Current");
  this.candidateSnapshot = await createSnapshot(this, "Candidate");
});

When("another candidate is requested", async function (this: InstalledDocumentsWorld) {
  this.snapshotOutcome = await documents(this).createDocumentSnapshot({ text: encoded("Extra") });
  if (this.snapshotOutcome.status === "success") this.snapshots?.push(this.snapshotOutcome.snapshotId);
});

Then("it is refused without creating another snapshot", async function (this: InstalledDocumentsWorld) {
  assert.ok(this.snapshotOutcome?.status === "failure");
  assert.equal(this.snapshotOutcome.code, "snapshot-limit");
  for (const snapshotId of [this.currentSnapshot, this.candidateSnapshot]) {
    assert.ok(snapshotId);
    const read = await documents(this).readDocumentSnapshot({ snapshotId });
    assert.ok(read.status === "success");
  }
});

When("the candidate is replaced with a new document", async function (this: InstalledDocumentsWorld) {
  assert.ok(this.candidateSnapshot);
  await releaseSnapshot(this, this.candidateSnapshot);
  this.candidateSnapshot = await createSnapshot(this, "Replacement");
});

Then("the new candidate is stored and the current snapshot remains available", async function (this: InstalledDocumentsWorld) {
  for (const [snapshotId, name] of [[this.currentSnapshot, "Current"], [this.candidateSnapshot, "Replacement"]]) {
    assert.ok(snapshotId && name);
    const result = await documents(this).readDocumentSnapshot({ snapshotId });
    assert.ok(result.status === "success", JSON.stringify(result));
    assert.equal(result.text, encoded(name));
  }
});
