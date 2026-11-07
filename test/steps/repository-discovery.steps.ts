import assert from "node:assert/strict";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import type { DiscoveryOutcome, ManifestArchitectureArtifact, ManifestChild } from "../../src/architecture/generated/contracts";
import { RepositoryDiscovery } from "../../src/architecture/repository-discovery.ts";
import { declaredRepository, MemoryRepository } from "../support/discovery-repository.ts";

interface DiscoveryWorld extends World {
  repository: MemoryRepository;
  discovery: DiscoveryOutcome;
}

const analyzer = (): ManifestArchitectureArtifact => ({
  path: ".dependency-cruiser.cjs", enforcer: "dependency-cruiser", inputs: ["src/components", "src/lib"],
});

function setRoot(repository: MemoryRepository, architecture: ManifestArchitectureArtifact[], children: ManifestChild[] = [{ name: "workspace", path: "src" }]): void {
  repository.setManifest(".", { name: "Atlas", artifacts: { architecture }, children });
}

Given("a repository declares a workspace containing several source directories", function (this: DiscoveryWorld) {
  this.repository = declaredRepository();
});

Given("an unlinked component manifest exists elsewhere in the repository", function (this: DiscoveryWorld) {
  this.repository.setManifest("experiments", { name: "ignored" });
});

Given("a declared API component links to a sibling core directory", function (this: DiscoveryWorld) {
  this.repository = declaredRepository();
  setRoot(this.repository, [analyzer()], [{ name: "API", path: "src/api" }]);
  this.repository.setManifest("src/api", { name: "API", children: [{ name: "core", path: "../core" }] });
  this.repository.setManifest("src/core", { name: "core" });
});

Given("only the selected directory's parent contains a component manifest", function (this: DiscoveryWorld) {
  this.repository = new MemoryRepository();
  this.repository.files.set("../component.yaml", "name: Parent");
});

Given("a repository has analyzer metadata in a child manifest", function (this: DiscoveryWorld) {
  this.repository = declaredRepository();
  this.repository.setManifest("src", {
    name: "workspace", artifacts: { architecture: [{ path: "../.dependency-cruiser.cjs", enforcer: "child-tool", inputs: ["."] }] },
  });
});

Given("a repository uses spaces in its component and analyzer paths", function (this: DiscoveryWorld) {
  this.repository = new MemoryRepository();
  this.repository.addFile("tools config/cruise config.cjs");
  this.repository.addDirectory("source code/components");
  this.repository.addDirectory("source code/utilities");
  setRoot(this.repository, [{ path: "tools config/cruise config.cjs", enforcer: "dependency-cruiser", inputs: ["source code/components", "source code/utilities"] }], [{ name: "Source code", path: "source code" }]);
  this.repository.setManifest("source code", { name: "Source code" });
});

Given("a repository has {string} in its root analyzer declaration", function (this: DiscoveryWorld, problem: string) {
  this.repository = declaredRepository();
  const entry = analyzer();
  const entries = [entry];
  switch (problem) {
    case "no analyzer metadata": entries.splice(0, 1, { path: entry.path }); break;
    case "two annotated analyzers": entries.push({ ...entry }); break;
    case "an unsupported enforcer": entry.enforcer = "unknown"; break;
    case "missing inputs": delete entry.inputs; break;
    case "an empty input list": entry.inputs = []; break;
    case "a missing source path": entry.inputs = ["missing"]; break;
    case "a glob input": entry.inputs = ["src/**/*.ts"]; break;
    case "a shell fragment input": entry.inputs = ["src; echo unwanted"]; break;
    default: assert.fail(`Unknown analyzer defect: ${problem}`);
  }
  setRoot(this.repository, entries);
});

Given("a repository has {string} in its component declarations", function (this: DiscoveryWorld, problem: string) {
  this.repository = declaredRepository();
  const children = [{ name: "workspace", path: "src" }];
  switch (problem) {
    case "an outside directory": children.push({ name: "outside", path: "../outside" }); break;
    case "an escaping directory link":
      this.repository.aliases.set("escape", "../outside");
      children.push({ name: "outside", path: "escape" });
      break;
    case "a repeated directory": children.push({ name: "workspace", path: "src/../src" }); break;
    case "an ancestor link": this.repository.setManifest("src", { name: "workspace", children: [{ name: "Atlas", path: ".." }] }); break;
    case "duplicate component names":
      children.push({ name: "workspace", path: "core" });
      this.repository.setManifest("core", { name: "workspace" });
      break;
    case "a child name mismatch": children.splice(0, 1, { name: "different", path: "src" }); break;
    case "a missing child manifest": this.repository.files.delete("src/component.yaml"); break;
    default: assert.fail(`Unknown declaration defect: ${problem}`);
  }
  setRoot(this.repository, [analyzer()], children);
});

When("the repository is discovered", async function (this: DiscoveryWorld) {
  this.discovery = await new RepositoryDiscovery(this.repository).discover({ rootPath: this.repository.rootPath });
});

Then("only the root and declared workspace are discovered", function (this: DiscoveryWorld) {
  if (this.discovery.status !== "success") assert.fail(this.discovery.message);
  assert.deepEqual(this.discovery.repository.components, [
    { id: ".", name: "Atlas" }, { id: "src", name: "workspace", parent: "." },
  ]);
});

Then("the source directories remain analyzer inputs", function (this: DiscoveryWorld) {
  assert.ok(this.discovery.status === "success");
  assert.deepEqual(this.discovery.repository.analysis.inputs, ["src/components", "src/lib"]);
});

Then("the core component belongs to the API in the declaration tree", function (this: DiscoveryWorld) {
  assert.ok(this.discovery.status === "success");
  assert.deepEqual(this.discovery.repository.components.find(({ id }) => id === "src/core"), { id: "src/core", name: "core", parent: "src/api" });
});

Then("discovery fails with {string}", function (this: DiscoveryWorld, code: string) {
  assert.ok(this.discovery.status === "failure");
  assert.equal(this.discovery.stage, "discovery");
  assert.equal(this.discovery.code, code);
  assert.ok(this.discovery.message.length > 0);
});

Then("discovery selects only the root analyzer", function (this: DiscoveryWorld) {
  assert.ok(this.discovery.status === "success");
  assert.deepEqual(this.discovery.repository.analysis, { enforcer: "dependency-cruiser", config: ".dependency-cruiser.cjs", inputs: ["src/components", "src/lib"] });
});

Then("discovery preserves those path names", function (this: DiscoveryWorld) {
  assert.ok(this.discovery.status === "success");
  assert.deepEqual(this.discovery.repository.analysis, { enforcer: "dependency-cruiser", config: "tools config/cruise config.cjs", inputs: ["source code/components", "source code/utilities"] });
  assert.deepEqual(this.discovery.repository.components, [{ id: ".", name: "Atlas" }, { id: "source code", name: "Source code", parent: "." }]);
});

Then("discovery closes its repository session", function (this: DiscoveryWorld) {
  assert.equal(this.discovery.status, "failure");
  assert.equal(this.repository.activeSessions.size, 0);
});

Then("discovery reports a nonnegative duration", function (this: DiscoveryWorld) {
  assert.ok(Number.isFinite(this.discovery.durationMs) && this.discovery.durationMs >= 0);
});

Then("its caller receives an open repository session", function (this: DiscoveryWorld) {
  assert.ok(this.discovery.status === "success");
  assert.deepEqual([...this.repository.activeSessions], [this.discovery.repository.repositorySession]);
});
