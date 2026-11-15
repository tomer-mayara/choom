import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { After, Given, Then, When, type World } from "@cucumber/cucumber";
import { type CommandResult, makeScratch, removeScratch } from "../../packages/producer/test/support/commands.ts";
import { capturedRun, noSettingsTarget, stageOne, type StageOneRun }
  from "../../packages/producer/test/support/stage-1-run.ts";

// The scenario records the settings of a captured snapshot that has JavaScript
// and TypeScript files and no compiler settings. The capture uses the rsync test double.
interface SettingsGap { kind?: unknown; reason?: unknown }
interface SettingsRecord { parsingProfile?: { id?: unknown; assumptions?: unknown } | null; gaps?: SettingsGap[] }

interface ParsingProfileWorld extends World {
  profileScratch?: string;
  profileRun?: StageOneRun;
  settingsCommand?: CommandResult;
}

function currentRun(world: ParsingProfileWorld): StageOneRun {
  assert.ok(world.profileRun, "Capture a snapshot first.");
  return world.profileRun;
}

// The settings record that the settings action saved.
function savedSettings(world: ParsingProfileWorld): SettingsRecord {
  const command = world.settingsCommand;
  assert.ok(command, "Record the project settings first.");
  assert.equal(command.status, 0, command.stderr);
  return JSON.parse(readFileSync(join(currentRun(world).work, "evidence/settings.json"), "utf8")) as SettingsRecord;
}

function namedProfile(world: ParsingProfileWorld): { id?: unknown; assumptions?: unknown } {
  const profile = savedSettings(world).parsingProfile;
  assert.ok(profile, "The settings record names no parsing profile.");
  return profile;
}

After({ tags: "@producer" }, function (this: ParsingProfileWorld) {
  if (this.profileScratch) removeScratch(this.profileScratch);
});

Given("a saved snapshot with JavaScript and TypeScript files and no compiler settings", function (this: ParsingProfileWorld) {
  this.profileScratch = makeScratch();
  this.profileRun = capturedRun(this.profileScratch, noSettingsTarget);
});

When("the operator records the project settings", function (this: ParsingProfileWorld) {
  this.settingsCommand = stageOne(currentRun(this), "settings");
});

Then("the settings record names the Choom parsing profile and its version", function (this: ParsingProfileWorld) {
  assert.equal(namedProfile(this).id, "choom-default-v1");
});

Then("it lists the assumptions of that profile", function (this: ParsingProfileWorld) {
  const { assumptions } = namedProfile(this);
  assert.ok(Array.isArray(assumptions) && assumptions.length > 0, "The profile lists no assumptions.");
  for (const assumption of assumptions) assert.ok(typeof assumption === "string" && assumption.trim() !== "", String(assumption));
});

Then("a gap says that no project settings were found", function (this: ParsingProfileWorld) {
  const gaps = savedSettings(this).gaps ?? [];
  const gap = gaps.find(({ kind }) => kind === "no-project-settings");
  assert.ok(gap, "The settings record has no gap for the missing project settings.");
  assert.match(String(gap.reason), /^No project settings were found\b/);
});
