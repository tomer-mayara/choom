import assert from "node:assert/strict";
import { Then, When, type World } from "@cucumber/cucumber";
import type { InstalledBaselineDriver } from "../support/baseline-viewer/installed-driver.ts";

interface RetiredCommandWorld extends World {
  installedBaselineDriver?: InstalledBaselineDriver;
  retiredCommand?: string;
  retiredCommandResult?: Awaited<ReturnType<InstalledBaselineDriver["requestRetiredCommand"]>>;
}

When("the installed caller requests the retired command {string}", async function (this: RetiredCommandWorld, command: string) {
  assert.ok(this.installedBaselineDriver, "The scenario must open installed Choom");
  this.retiredCommand = command;
  this.retiredCommandResult = await this.installedBaselineDriver.requestRetiredCommand(command);
  await this.attach(JSON.stringify({ command, result: this.retiredCommandResult }), "application/json");
});

Then("the native host rejects that command before a command handler runs", function (this: RetiredCommandWorld) {
  assert.ok(this.retiredCommand && this.retiredCommandResult, "The scenario must request a retired command");
  assert.equal(this.retiredCommandResult.status, "rejected",
    `${this.retiredCommand} must be rejected by the native host, not return a command-handler response`);
  assert.match(this.retiredCommandResult.message,
    new RegExp(`^Command ${this.retiredCommand} (?:not found|not allowed by ACL)$`));
});
