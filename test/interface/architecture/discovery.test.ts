import { expect, expectTypeOf, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { z } from "zod";
import contracts from "../../../cookbook/interfaces/generated/contracts.schema.json";
import { componentManifestSchema, type readComponentManifest } from "../../../src/architecture/component-manifest";
import type {
  ComponentManifest,
  DiscoveryOperations,
  DiscoveryOutcome,
} from "../../../src/architecture/generated/contracts";
import { RepositoryDiscovery } from "../../../src/architecture/repository-discovery";
import { declaredRepository } from "../../support/discovery-repository";

const ajv = addFormats(new Ajv2020({ schemas: [contracts] }));
const validateManifest = ajv.compile({ $ref: "ComponentManifest.json" });
const validateOutcome = ajv.compile({ $ref: "DiscoveryOutcome.json" });

test("workspace readers and asynchronous discovery bind generated contracts", () => {
  expectTypeOf<z.output<typeof componentManifestSchema>>().toEqualTypeOf<ComponentManifest>();
  expectTypeOf<ReturnType<typeof readComponentManifest>>().toEqualTypeOf<ComponentManifest>();
  expectTypeOf<Parameters<RepositoryDiscovery["discover"]>>().toEqualTypeOf<Parameters<DiscoveryOperations["discover"]>>();
  expectTypeOf<Awaited<ReturnType<RepositoryDiscovery["discover"]>>>().toEqualTypeOf<DiscoveryOutcome>();
});

test("the manifest boundary allows sparse declarations and incomplete analyzer metadata", () => {
  const inputs: ComponentManifest[] = [
    { name: "native" },
    { name: "workspace", children: [{ name: "domain", path: "../core" }] },
    { name: "Atlas", artifacts: { architecture: [{ path: "rules.cjs" }] } },
    { name: "Atlas", artifacts: { architecture: [{ path: "rules.cjs", enforcer: "dependency-cruiser", inputs: [] }] } },
    { name: "Atlas", artifacts: { architecture: [{ path: "rules.cjs", inputs: [""] }] } },
  ];
  for (const input of inputs) {
    expect(validateManifest(input)).toBe(true);
    expect(componentManifestSchema.parse(input)).toEqual(input);
  }
});

test.each([
  ["unknown root field", { name: "Atlas", directories: ["src"] }],
  ["wrong name type", { name: 1 }],
  ["unknown artifact field", { name: "Atlas", artifacts: { architecture: [{ path: "rules.cjs", command: "analyze" }] } }],
  ["metadata outside architecture", { name: "Atlas", artifacts: { behavior: [{ path: "behavior.feature", inputs: ["src"] }] } }],
  ["too many inputs", { name: "Atlas", artifacts: { architecture: [{ path: "rules.cjs", inputs: Array.from({ length: 129 }, () => ".") }] } }],
  ["unknown child field", { name: "Atlas", children: [{ name: "child", path: "src", extra: true }] }],
  ["too many child links", { name: "Atlas", children: Array.from({ length: 129 }, () => ({ name: "child", path: "src" })) }],
])("generated and runtime manifest formats both reject %s", (_label, input) => {
  expect(validateManifest(input)).toBe(false);
  expect(componentManifestSchema.safeParse(input).success).toBe(false);
});

test("successful and failed discovery results conform to the generated operation result", async () => {
  const repository = declaredRepository();
  const discovery = new RepositoryDiscovery(repository, () => 1);
  const success = await discovery.discover({ rootPath: repository.rootPath });
  repository.files.delete("component.yaml");
  const failure = await discovery.discover({ rootPath: repository.rootPath });

  expect(success.status).toBe("success");
  expect(failure.status).toBe("failure");
  expect(validateOutcome(success)).toBe(true);
  expect(validateOutcome(failure)).toBe(true);
});

test("unknown discovery request fields are rejected before opening a repository", async () => {
  const repository = declaredRepository();
  const result = await new RepositoryDiscovery(repository).discover({ rootPath: repository.rootPath, ...{ shell: "extra" } });

  expect(result).toMatchObject({ status: "failure", code: "invalid-root" });
  expect(repository.activeSessions.size).toBe(0);
  expect(validateOutcome(result)).toBe(true);
});
