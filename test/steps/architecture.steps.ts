import assert from "node:assert/strict";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import {
  architectureSchema,
  starterArchitecture,
  type Architecture,
} from "../../src/domain/architecture.ts";

interface ArchitectureWorld extends World {
  model: Architecture;
  result: ReturnType<typeof architectureSchema.safeParse>;
}

Given("the starter architecture", function (this: ArchitectureWorld) {
  this.model = structuredClone(starterArchitecture);
});

Given("a connection to an unknown node", function (this: ArchitectureWorld) {
  this.model.edges.push({ id: "dangling", source: "ui", target: "unknown" });
});

Given("a connection from an unknown node", function (this: ArchitectureWorld) {
  this.model.edges.push({ id: "dangling", source: "unknown", target: "ui" });
});

Given(
  /^a duplicate (node|edge) identifier$/,
  function (this: ArchitectureWorld, kind: "node" | "edge") {
    if (kind === "node") {
      this.model.nodes.push({ id: "ui", label: "Another interface" });
    } else {
      this.model.edges.push({ id: "ui-domain", source: "domain", target: "ui" });
    }
  },
);

Given(
  /^an empty (name|node ID|node label|edge ID|edge source|edge target)$/,
  function (this: ArchitectureWorld, field: string) {
    const [node] = this.model.nodes;
    const [edge] = this.model.edges;
    assert.ok(node);
    assert.ok(edge);
    switch (field) {
      case "name":
        this.model.name = "";
        break;
      case "node ID":
        node.id = "";
        this.model.edges = [];
        break;
      case "node label":
        node.label = "";
        break;
      case "edge ID":
        edge.id = "";
        break;
      case "edge source":
        edge.source = "";
        break;
      case "edge target":
        edge.target = "";
        break;
    }
  },
);

Given("no nodes or connections", function (this: ArchitectureWorld) {
  this.model.nodes = [];
  this.model.edges = [];
});

Given("no connections", function (this: ArchitectureWorld) {
  this.model.edges = [];
});

Given(
  "a connection from the interface node to itself",
  function (this: ArchitectureWorld) {
    this.model.edges.push({ id: "loop", source: "ui", target: "ui" });
  },
);

Given(
  "a connection from the domain node back to the interface node",
  function (this: ArchitectureWorld) {
    this.model.edges.push({ id: "return", source: "domain", target: "ui" });
  },
);

Given(
  "an architecture with whitespace as its name, node ID, and label",
  function (this: ArchitectureWorld) {
    this.model = { name: " ", nodes: [{ id: " ", label: " " }], edges: [] };
  },
);

Given(
  "extra fields on the architecture, its first node, and its first connection",
  function (this: ArchitectureWorld) {
    const [node] = this.model.nodes;
    const [edge] = this.model.edges;
    assert.ok(node);
    assert.ok(edge);
    Object.assign(this.model, { extra: "ignored" });
    Object.assign(node, { extra: "ignored" });
    Object.assign(edge, { extra: "ignored" });
  },
);

When("the architecture is validated", function (this: ArchitectureWorld) {
  this.result = architectureSchema.safeParse(this.model);
});

Then("the architecture is accepted", function (this: ArchitectureWorld) {
  assert.equal(this.result.success, true);
});

Then("the architecture is rejected", function (this: ArchitectureWorld) {
  assert.equal(this.result.success, false);
});

Then(
  "the parsed architecture preserves the whitespace",
  function (this: ArchitectureWorld) {
    assert.ok(this.result.success);
    assert.deepEqual(this.result.data, this.model);
  },
);

Then(
  "the parsed architecture contains only the starter fields",
  function (this: ArchitectureWorld) {
    assert.ok(this.result.success);
    assert.deepEqual(this.result.data, starterArchitecture);
  },
);
