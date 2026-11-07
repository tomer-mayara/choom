import assert from "node:assert/strict";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import { architectureDocumentSchema } from "../../src/domain/architecture-document.ts";
import { buildArchitectureDocument } from "../../src/domain/build-architecture-document.ts";
import {
  folderFinding,
  mixedImportObservations,
  savedCycle,
  workspaceObservations,
} from "../support/domain-model-fixtures.ts";

interface DomainModelWorld extends World {
  input: Parameters<typeof buildArchitectureDocument>[0];
  document: ReturnType<typeof buildArchitectureDocument>;
  reorderedDocument: ReturnType<typeof buildArchitectureDocument>;
  saved: unknown;
  validation: ReturnType<typeof architectureDocumentSchema.safeParse>;
}

Given(
  "the declared workspace reports files and imports across three subdirectories",
  function (this: DomainModelWorld) {
    this.input = workspaceObservations();
    this.input.observations.files.push(
      "src/components/panel.ts",
      "src/lib/format.ts",
      "src/hooks/use-model.ts",
      "src/components/panel.ts",
      "node_modules/tool/index.js",
    );
    this.input.observations.imports.push(
      { sourceFile: "src/components/panel.ts", targetFile: "src/hooks/use-model.ts" },
      { sourceFile: "src/hooks/use-model.ts", targetFile: "src/lib/format.ts" },
    );
  },
);

Given(
  "declarations for the workspace and domain are siblings in the manifest tree",
  function (this: DomainModelWorld) {
    this.input = workspaceObservations();
    this.input.components.push({ id: "src/domain", name: "domain", parent: "." });
  },
);

Given(
  "reported files are in the root, domain, and a similarly named directory",
  function (this: DomainModelWorld) {
    this.input.observations.files.push("config.ts", "src/domain/model.ts", "src/domain-extra/tool.ts");
  },
);

Given(
  "the interface imports core through two file pairs with mixed and unreported flags",
  function (this: DomainModelWorld) {
    this.input = mixedImportObservations();
  },
);

Given(
  "a folder finding reports source and target roles, a cycle, a via path, and metrics",
  function (this: DomainModelWorld) {
    this.input = workspaceObservations();
    this.input.observations.diagnostics.push(structuredClone(folderFinding));
  },
);

When("the architecture document is built", function (this: DomainModelWorld) {
  this.document = buildArchitectureDocument(this.input);
});

Then(
  "only the declared components appear, with three files in the workspace",
  function (this: DomainModelWorld) {
    assert.deepEqual(this.document.components, [
      { id: ".", name: "atlas", reportedFiles: 0 },
      { id: "src", name: "workspace", parent: ".", reportedFiles: 3 },
    ]);
  },
);

Then("the workspace's internal imports create no relationships", function (this: DomainModelWorld) {
  assert.deepEqual(this.document.relationships, []);
});

Then(
  "the root, workspace, and domain each own one reported file",
  function (this: DomainModelWorld) {
    assert.deepEqual(this.document.components.map(({ id, reportedFiles }) => ({ id, reportedFiles })), [
      { id: ".", reportedFiles: 1 },
      { id: "src", reportedFiles: 1 },
      { id: "src/domain", reportedFiles: 1 },
    ]);
  },
);

Then("the domain declaration still has the root as its parent", function (this: DomainModelWorld) {
  assert.equal(this.document.components.find(({ id }) => id === "src/domain")?.parent, ".");
});

Then(
  "one interface-to-core relationship records both file pairs and their distinct variants",
  function (this: DomainModelWorld) {
    const [relationship] = this.document.relationships;
    assert.equal(this.document.relationships.length, 1);
    assert.ok(relationship);
    const { evidence, ...endpoints } = relationship;
    assert.deepEqual(endpoints, {
      id: "imports:src%2Fui:src%2Fcore",
      source: "src/ui",
      target: "src/core",
      kind: "imports",
    });
    const [mixed, unknown] = evidence;
    assert.equal(evidence.length, 2);
    assert.ok(mixed);
    assert.equal(mixed.sourceFile, "src/ui/components/a.ts");
    assert.equal(mixed.targetFile, "src/core/model/entity.ts");
    assert.equal(mixed.variants.length, 2);
    assert.deepEqual(mixed.variants.find(({ typeOnly }) => typeOnly === false), {
      typeOnly: false,
      dynamic: true,
    });
    assert.deepEqual(mixed.variants.find(({ typeOnly }) => typeOnly === true), {
      typeOnly: true,
      preCompilationOnly: true,
    });
    assert.deepEqual(unknown, {
      sourceFile: "src/ui/components/b.ts",
      targetFile: "src/core/model/entity.ts",
      variants: [{}],
    });
  },
);

When(
  "architecture documents are built from the same observations in different orders",
  function (this: DomainModelWorld) {
    const reordered = structuredClone(this.input);
    reordered.components.reverse();
    reordered.observations.files.reverse();
    reordered.observations.imports.reverse();
    this.document = buildArchitectureDocument(this.input);
    this.reorderedDocument = buildArchitectureDocument(reordered);
  },
);

Then("both documents are identical", function (this: DomainModelWorld) {
  assert.deepEqual(this.document, this.reorderedDocument);
});

Then(
  "the finding keeps its roles, ordered paths, and metric values",
  function (this: DomainModelWorld) {
    assert.equal(this.document.diagnostics.length, 1);
    const [finding] = this.document.diagnostics;
    assert.ok(finding);
    const { subjects, ...details } = finding;
    const { subjects: expectedSubjects, ...expectedDetails } = folderFinding;
    assert.deepEqual(details, expectedDetails);
    assert.deepEqual(subjects.find(({ role }) => role === "source"), expectedSubjects[1]);
    assert.deepEqual(subjects.find(({ role }) => role === "target"), expectedSubjects[0]);
    assert.equal(subjects.length, 2);
  },
);

Then("the finding creates no relationships", function (this: DomainModelWorld) {
  assert.deepEqual(this.document.relationships, []);
});

Given(
  "a saved architecture document with imports in both directions and shuffled components",
  function (this: DomainModelWorld) {
    this.saved = savedCycle();
  },
);

Given("a saved architecture document with {string}", function (this: DomainModelWorld, defect: string) {
  const saved = savedCycle();
  const [ui, , core] = saved.components;
  const [relationship] = saved.relationships;
  const [evidence] = relationship?.evidence ?? [];
  assert.ok(ui && core && relationship && evidence);
  switch (defect) {
    case "a missing root declaration":
      saved.components.splice(1, 1);
      break;
    case "a cycle of parent declarations":
      ui.parent = "src/core";
      core.parent = "src/ui";
      break;
    case "two imports for the same ordered pair":
      saved.relationships.push(structuredClone(relationship));
      break;
    case "an evidence file owned by another component":
      evidence.sourceFile = "src/core/view.ts";
      break;
    case "a repeated evidence variant":
      evidence.variants.push({ typeOnly: true });
      break;
    case "a noncanonical relationship identifier":
      relationship.id = "imports:src/ui:src/core";
      break;
    case "an unknown semantic field":
      Object.assign(evidence, { layout: "left" });
      break;
    default:
      assert.fail(`Unknown document defect: ${defect}`);
  }
  this.saved = saved;
});

When("the architecture document is validated", function (this: DomainModelWorld) {
  this.validation = architectureDocumentSchema.safeParse(this.saved);
});

Then(
  "both directed imports and the declared components appear in canonical order",
  function (this: DomainModelWorld) {
    assert.ok(this.validation.success);
    assert.deepEqual(this.validation.data.components.map(({ id }) => id), [".", "src/core", "src/ui"]);
    assert.deepEqual(this.validation.data.relationships.map(({ id }) => id), [
      "imports:src%2Fcore:src%2Fui",
      "imports:src%2Fui:src%2Fcore",
    ]);
  },
);

Then("the architecture document is rejected", function (this: DomainModelWorld) {
  assert.equal(this.validation.success, false);
});
