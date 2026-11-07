import { expect, test } from "bun:test";
import { RepositoryDiscovery } from "../../../src/architecture/repository-discovery";
import type { ComponentManifest } from "../../../src/architecture/generated/contracts";
import { declaredRepository, MemoryRepository } from "../../support/discovery-repository";

function rootManifest(children: ComponentManifest["children"] = []): ComponentManifest {
  return {
    name: "Atlas",
    artifacts: { architecture: [{ path: ".dependency-cruiser.cjs", enforcer: "dependency-cruiser", inputs: ["."] }] },
    children,
  };
}

test.each(["openRepository", "readRepositoryText", "resolveRepositoryPaths"] as const)(
  "%s permission refusal identifies denied access and releases any session",
  async (operation) => {
    const repository = declaredRepository();
    repository[operation] = async () => ({ status: "failure", code: "access-denied", message: "Access denied at /private/source." });
    const result = await new RepositoryDiscovery(repository).discover({ rootPath: repository.rootPath });
    expect(result).toMatchObject({
      status: "failure", stage: "discovery", code: "access-failed",
      message: "The operating system denied repository access. Check the selected repository's permissions.",
    });
    expect(JSON.stringify(result)).not.toContain("/private");
    expect(repository.activeSessions.size).toBe(0);
  },
);

test("discovery follows declarations and transfers a live session", async () => {
  const repository = declaredRepository();
  repository.setManifest("unused", { name: "unlinked" });
  const discovery = new RepositoryDiscovery(repository, () => 12);

  const result = await discovery.discover({ rootPath: repository.rootPath });

  expect(result).toEqual({
    status: "success",
    durationMs: 0,
    repository: {
      repositorySession: "repository-1",
      name: "Atlas",
      components: [
        { id: ".", name: "Atlas" },
        { id: "src", name: "workspace", parent: "." },
      ],
      analysis: {
        enforcer: "dependency-cruiser",
        config: ".dependency-cruiser.cjs",
        inputs: ["src/components", "src/lib"],
      },
    },
  });
  expect(repository.activeSessions.size).toBe(1);
});

test("invalid YAML fails discovery and releases the session", async () => {
  const repository = declaredRepository();
  repository.files.set("component.yaml", "name: Atlas\nname: duplicate\n");

  const result = await new RepositoryDiscovery(repository).discover({ rootPath: repository.rootPath });

  expect(result).toMatchObject({ status: "failure", stage: "discovery", code: "invalid-manifest" });
  expect(repository.activeSessions.size).toBe(0);
});

test("an empty root input is an analyzer input error", async () => {
  const repository = declaredRepository();
  repository.setManifest(".", { name: "Atlas", artifacts: { architecture: [
    { path: ".dependency-cruiser.cjs", enforcer: "dependency-cruiser", inputs: [""] },
  ] } });

  const result = await new RepositoryDiscovery(repository).discover({ rootPath: repository.rootPath });

  expect(result).toMatchObject({ status: "failure", code: "invalid-input" });
});

test("analyzer declaration failures explain the specific rule", async () => {
  const analyzer = { path: ".dependency-cruiser.cjs", enforcer: "dependency-cruiser", inputs: ["src"] };
  const cases: [ComponentManifest["artifacts"], string, string][] = [
    [undefined, "missing-analyzer", "An enforcer declaration is required in the root manifest."],
    [{ architecture: [analyzer, analyzer] }, "multiple-analyzers", "Exactly one root analyzer is supported."],
    [{ architecture: [{ ...analyzer, enforcer: "private-tool" }] }, "unsupported-enforcer", "The declared enforcer is unsupported."],
    [{ architecture: [{ path: analyzer.path, enforcer: analyzer.enforcer }] }, "invalid-input", "Explicit source inputs are required for the root analyzer."],
    [{ architecture: [{ ...analyzer, inputs: [] }] }, "invalid-input", "At least one source input is required for the root analyzer."],
    [{ architecture: [{ ...analyzer, inputs: ["missing-source"] }] }, "invalid-input", "Source inputs must exist inside the selected repository."],
    [{ architecture: [{ ...analyzer, inputs: ["src/**/*.ts"] }] }, "invalid-input", "Source inputs must be literal files or folders."],
    [{ architecture: [{ ...analyzer, inputs: ["$(private-command)"] }] }, "invalid-input", "Source inputs must be literal files or folders."],
  ];
  for (const [artifacts, code, message] of cases) {
    const repository = declaredRepository();
    repository.setManifest(".", { name: "Atlas", ...(artifacts === undefined ? {} : { artifacts }) });
    const result = await new RepositoryDiscovery(repository).discover({ rootPath: repository.rootPath });
    expect(result).toMatchObject({ status: "failure", code, message });
    expect(repository.activeSessions.size).toBe(0);
    expect(JSON.stringify(result)).not.toContain("private-");
  }
});

test("repeated directories and ancestor cycles have distinct safe explanations", async () => {
  const repeated = declaredRepository();
  repeated.setManifest(".", rootManifest([{ name: "workspace", path: "src" }, { name: "workspace", path: "src" }]));
  expect(await new RepositoryDiscovery(repeated).discover({ rootPath: repeated.rootPath })).toMatchObject({
    status: "failure", code: "duplicate-component", message: "Component directories must be unique.",
  });
  const cycle = declaredRepository();
  cycle.setManifest("src", { name: "workspace", children: [{ name: "Atlas", path: ".." }] });
  expect(await new RepositoryDiscovery(cycle).discover({ rootPath: cycle.rootPath })).toMatchObject({
    status: "failure", code: "duplicate-component", message: "Child links must not form cycles.",
  });
});

test("missing manifest messages identify its role without quoting a host or declared path", async () => {
  const missingRoot = declaredRepository();
  missingRoot.files.delete("component.yaml");
  expect(await new RepositoryDiscovery(missingRoot).discover({ rootPath: missingRoot.rootPath })).toMatchObject({
    status: "failure", code: "manifest-unreadable", message: "The selected repository needs a readable root component.yaml manifest.",
  });
  const missingChild = declaredRepository();
  missingChild.setManifest(".", rootManifest([{ name: "secret", path: "private-child" }]));
  missingChild.addDirectory("private-child");
  const result = await new RepositoryDiscovery(missingChild).discover({ rootPath: missingChild.rootPath });
  expect(result).toMatchObject({
    status: "failure", code: "manifest-unreadable", message: "Each declared child needs a readable component.yaml manifest.",
  });
  expect(JSON.stringify(result)).not.toContain("private-child");
});

test("invalid discovery requests do not acquire a repository session", async () => {
  const repository = declaredRepository();
  repository.openRepository = async () => { throw new Error("An invalid request must not reach repository access."); };

  const result = await new RepositoryDiscovery(repository).discover({ rootPath: "/" + "é".repeat(2048) });

  expect(result).toMatchObject({ status: "failure", code: "invalid-root" });
  expect(repository.activeSessions.size).toBe(0);
});

test("declaration parents and canonical directory ownership are separate", async () => {
  const repository = declaredRepository();
  repository.setManifest(".", rootManifest([{ name: "API", path: "src/api" }]));
  repository.setManifest("src/api", { name: "API", children: [{ name: "core", path: "../core" }] });
  repository.setManifest("src/core", { name: "core" });

  const result = await new RepositoryDiscovery(repository).discover({ rootPath: repository.rootPath });

  expect(result).toMatchObject({ status: "success", repository: { components: [
    { id: ".", name: "Atlas" },
    { id: "src/api", name: "API", parent: "." },
    { id: "src/core", name: "core", parent: "src/api" },
  ] } });
});

test("a contained manifest symlink resolves references from its real location", async () => {
  const repository = declaredRepository();
  repository.files.delete("component.yaml");
  repository.aliases.set("component.yaml", "declarations/root.yaml");
  repository.addFile("declarations/root.yaml", "name: Atlas\nartifacts:\n  architecture:\n    - path: ../.dependency-cruiser.cjs\n      enforcer: dependency-cruiser\n      inputs: [../src]\nchildren:\n  - name: workspace\n    path: ../src\n");

  const result = await new RepositoryDiscovery(repository).discover({ rootPath: repository.rootPath });

  expect(result).toMatchObject({ status: "success", repository: {
    components: [{ id: ".", name: "Atlas" }, { id: "src", name: "workspace", parent: "." }],
    analysis: { config: ".dependency-cruiser.cjs", inputs: ["src"] },
  } });
});

test("child analyzer metadata is structural data and creates no selected job", async () => {
  const repository = declaredRepository();
  repository.addFile("src/child-config.cjs");
  repository.setManifest("src", { name: "workspace", artifacts: { architecture: [
    { path: "child-config.cjs", enforcer: "another-tool", inputs: ["/unused/child/input", "*.unused"] },
  ] } });

  const result = await new RepositoryDiscovery(repository).discover({ rootPath: repository.rootPath });

  expect(result).toMatchObject({ status: "success", repository: { analysis: {
    enforcer: "dependency-cruiser", config: ".dependency-cruiser.cjs", inputs: ["src/components", "src/lib"],
  } } });
});

test("aliases of one component directory cannot create extra components", async () => {
  const repository = declaredRepository();
  repository.aliases.set("alias", "src");
  repository.setManifest(".", rootManifest([{ name: "workspace", path: "src" }, { name: "workspace", path: "alias" }]));

  const result = await new RepositoryDiscovery(repository).discover({ rootPath: repository.rootPath });

  expect(result).toMatchObject({ status: "failure", code: "duplicate-component" });
  expect(repository.activeSessions.size).toBe(0);
});

test.each(["outside", "directory", "absent"])("every declared artifact must be a contained file: %s", async (defect) => {
  const repository = declaredRepository();
  repository.aliases.set("outside", "../outside");
  repository.addDirectory("directory");
  repository.setManifest("src", { name: "workspace", artifacts: { behavior: [{ path: `../${defect}` }] } });

  const result = await new RepositoryDiscovery(repository).discover({ rootPath: repository.rootPath });

  expect(result).toMatchObject({ status: "failure", code: "invalid-reference" });
  expect(repository.activeSessions.size).toBe(0);
});

test("canonical input aliases are deduplicated without changing component declarations", async () => {
  const repository = declaredRepository();
  repository.aliases.set("source alias", "src");
  const manifest = rootManifest();
  manifest.artifacts = { architecture: [{ path: "./.dependency-cruiser.cjs", enforcer: "dependency-cruiser", inputs: ["src/lib", "source alias", "./src", "."] }] };
  repository.setManifest(".", manifest);

  const result = await new RepositoryDiscovery(repository).discover({ rootPath: repository.rootPath });

  expect(result).toMatchObject({ status: "success", repository: {
    components: [{ id: ".", name: "Atlas" }],
    analysis: { inputs: [".", "src", "src/lib"] },
  } });
});

test.each([
  ["./-flags", "-flags"],
  ["source alias", "source[abc]"],
])("canonical analyzer input %s must still be a literal source path", async (reference, canonical) => {
  const repository = declaredRepository();
  repository.aliases.set(reference, canonical);
  repository.addDirectory(canonical);
  repository.setManifest(".", { name: "Atlas", artifacts: { architecture: [
    { path: ".dependency-cruiser.cjs", enforcer: "dependency-cruiser", inputs: [reference] },
  ] } });

  const result = await new RepositoryDiscovery(repository).discover({ rootPath: repository.rootPath });

  expect(result).toMatchObject({ status: "failure", code: "invalid-input" });
  expect(repository.activeSessions.size).toBe(0);
});

test.each([
  ["./-rules.cjs", "-rules.cjs"],
  ["config alias.cjs", "rules[abc].cjs"],
])("canonical analyzer config %s must still be a literal path", async (reference, canonical) => {
  const repository = declaredRepository();
  repository.aliases.set(reference, canonical);
  repository.addFile(canonical);
  repository.setManifest(".", { name: "Atlas", artifacts: { architecture: [
    { path: reference, enforcer: "dependency-cruiser", inputs: ["."] },
  ] } });

  const result = await new RepositoryDiscovery(repository).discover({ rootPath: repository.rootPath });

  expect(result).toMatchObject({ status: "failure", code: "invalid-reference" });
  expect(repository.activeSessions.size).toBe(0);
});

test("ordinary component and artifact canonical paths are not analyzer arguments", async () => {
  const repository = declaredRepository();
  repository.aliases.set("component-link", "component[docs]");
  repository.aliases.set("component[docs]/notes-link", "component[docs]/notes[notes].feature");
  repository.addFile("component[docs]/notes[notes].feature");
  repository.setManifest(".", rootManifest([{ name: "workspace", path: "component-link" }]));
  repository.setManifest("component[docs]", { name: "workspace", artifacts: { behavior: [{ path: "notes-link" }] } });

  const result = await new RepositoryDiscovery(repository).discover({ rootPath: repository.rootPath });

  expect(result).toMatchObject({ status: "success", repository: { components: [
    { id: ".", name: "Atlas" }, { id: "component[docs]", name: "workspace", parent: "." },
  ] } });
});

test("empty and native components are retained without source inventories", async () => {
  const repository = declaredRepository();
  repository.setManifest(".", rootManifest([{ name: "empty", path: "empty" }, { name: "native", path: "native" }]));
  repository.setManifest("empty", { name: "empty" });
  repository.setManifest("native", { name: "native" });
  repository.addFile("native/lib.rs", "fn main() {}\n");

  const result = await new RepositoryDiscovery(repository).discover({ rootPath: repository.rootPath });

  expect(result).toMatchObject({ status: "success", repository: { components: [
    { id: ".", name: "Atlas" }, { id: "empty", name: "empty", parent: "." }, { id: "native", name: "native", parent: "." },
  ] } });
});

test("one discovery object isolates concurrent sessions and traversal state", async () => {
  const repository = declaredRepository();
  const discovery = new RepositoryDiscovery(repository);

  const results = await Promise.all([discovery.discover({ rootPath: repository.rootPath }), discovery.discover({ rootPath: repository.rootPath })]);

  expect(results.every((result) => result.status === "success")).toBe(true);
  expect(repository.activeSessions).toEqual(new Set(["repository-1", "repository-2"]));
  expect(results[0]).toMatchObject({ repository: { components: [{ id: ".", name: "Atlas" }, { id: "src", name: "workspace", parent: "." }] } });
});

test("a failed run does not retain declarations for the next run", async () => {
  const repository = declaredRepository();
  const discovery = new RepositoryDiscovery(repository);
  repository.files.delete("src/component.yaml");
  const failed = await discovery.discover({ rootPath: repository.rootPath });
  repository.setManifest("src", { name: "workspace" });

  const succeeded = await discovery.discover({ rootPath: repository.rootPath });

  expect(failed).toMatchObject({ status: "failure", code: "manifest-unreadable" });
  expect(succeeded).toMatchObject({ status: "success" });
  expect(repository.activeSessions).toEqual(new Set(["repository-2"]));
});

test("close failures stay visible alongside the original discovery problem", async () => {
  const repository = declaredRepository();
  repository.files.delete("component.yaml");
  repository.closeRepository = async () => ({ status: "failure", code: "io-error", message: "Transport failed." });

  const result = await new RepositoryDiscovery(repository).discover({ rootPath: repository.rootPath });

  expect(result).toMatchObject({ status: "failure", code: "cleanup-failed" });
  if (result.status !== "failure") throw new Error("Expected failed discovery.");
  expect(result.message).toContain("component.yaml");
  expect(result.message).toContain("could not be closed");
});

test("a rejected session release is an explicit cleanup failure without raw transport output", async () => {
  const repository = declaredRepository();
  repository.files.delete("component.yaml");
  repository.closeRepository = async () => { throw new Error("Cannot close /private/repository"); };

  const result = await new RepositoryDiscovery(repository).discover({ rootPath: repository.rootPath });

  expect(result).toMatchObject({ status: "failure", stage: "discovery", code: "cleanup-failed" });
  expect(JSON.stringify(result)).not.toContain("/private/");
  expect(repository.activeSessions.size).toBe(1);
});

test("transport rejections are bounded failures and release an opened session", async () => {
  const repository = declaredRepository();
  repository.readRepositoryText = async () => { throw new Error("/private/root: disconnected"); };

  const result = await new RepositoryDiscovery(repository).discover({ rootPath: repository.rootPath });

  expect(result).toMatchObject({ status: "failure", code: "access-failed" });
  expect(JSON.stringify(result)).not.toContain("/private/root");
  expect(repository.activeSessions.size).toBe(0);
});

test("manifest count allows 256 declarations and refuses the next", async () => {
  const repository = new MemoryRepository();
  repository.addFile(".dependency-cruiser.cjs");
  const root = rootManifest([{ name: "first", path: "first" }, { name: "second", path: "second" }]);
  repository.setManifest(".", root);
  for (const [parent, count] of [["first", 126], ["second", 127]] as const) {
    repository.setManifest(parent, { name: parent, children: Array.from({ length: count }, (_, index) => ({ name: `${parent}-${index}`, path: `child-${index}` })) });
    for (let index = 0; index < count; index += 1) repository.setManifest(`${parent}/child-${index}`, { name: `${parent}-${index}` });
  }
  const discovery = new RepositoryDiscovery(repository);

  const atLimit = await discovery.discover({ rootPath: repository.rootPath });
  repository.setManifest("second/child-126", { name: "second-126", children: [{ name: "extra", path: "extra" }] });
  repository.setManifest("second/child-126/extra", { name: "extra" });
  const overLimit = await discovery.discover({ rootPath: repository.rootPath });

  expect(atLimit).toMatchObject({ status: "success" });
  if (atLimit.status !== "success") throw new Error("Expected successful boundary discovery.");
  expect(atLimit.repository.components).toHaveLength(256);
  expect(overLimit).toMatchObject({ status: "failure", code: "limit-exceeded" });
  expect(repository.activeSessions).toEqual(new Set(["repository-1"]));
});

test("total manifest text allows 8 MiB and refuses the next byte", async () => {
  const repository = new MemoryRepository();
  repository.addFile(".dependency-cruiser.cjs");
  repository.setManifest(".", rootManifest(Array.from({ length: 32 }, (_, index) => ({ name: `child-${index}`, path: `child-${index}` }))));
  const rootBytes = new TextEncoder().encode(repository.files.get("component.yaml")).byteLength;
  for (let index = 0; index < 32; index += 1) {
    const header = `name: child-${index}\n#`;
    const remaining = index === 31 ? 262_144 - rootBytes : 262_144;
    repository.addFile(`child-${index}/component.yaml`, header + "a".repeat(remaining - header.length));
  }

  const discovery = new RepositoryDiscovery(repository);
  const atLimit = await discovery.discover({ rootPath: repository.rootPath });
  repository.files.set("child-31/component.yaml", `${repository.files.get("child-31/component.yaml")}a`);
  const overLimit = await discovery.discover({ rootPath: repository.rootPath });

  expect(atLimit).toMatchObject({ status: "success" });
  expect(overLimit).toMatchObject({ status: "failure", code: "limit-exceeded" });
  expect(repository.activeSessions).toEqual(new Set(["repository-1"]));
});
