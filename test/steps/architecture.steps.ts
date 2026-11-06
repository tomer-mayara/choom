import assert from "node:assert/strict";
import {
  Given,
  Then,
  When,
  World,
  setWorldConstructor,
} from "@cucumber/cucumber";
import {
  architectureSchema,
  starterArchitecture,
  type Architecture,
} from "../../src/domain/architecture.ts";

class ArchitectureWorld extends World {
  model: Architecture = structuredClone(starterArchitecture);
  accepted: boolean | undefined;
}

setWorldConstructor(ArchitectureWorld);

Given("the starter architecture", function (this: ArchitectureWorld) {
  this.model = structuredClone(starterArchitecture);
});

Given("a connection to an unknown node", function (this: ArchitectureWorld) {
  this.model.edges.push({ id: "dangling", source: "ui", target: "unknown" });
});

When("the architecture is validated", function (this: ArchitectureWorld) {
  this.accepted = architectureSchema.safeParse(this.model).success;
});

Then("the architecture is accepted", function (this: ArchitectureWorld) {
  assert.equal(this.accepted, true);
});

Then("the architecture is rejected", function (this: ArchitectureWorld) {
  assert.equal(this.accepted, false);
});
