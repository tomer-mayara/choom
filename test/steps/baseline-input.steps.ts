import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import { stringify } from "yaml";
import { decodeBaselineYaml } from "../../src/lib/baseline-yaml.ts";
import { readBrowserBaseline } from "../../src/platform/browser-documents.ts";
import { baselineExample, reviewedBaseline } from "../support/baseline-fixtures.ts";

interface BaselineInputWorld extends World {
  selectedBaselineFile: File;
  expectedBaseline: unknown;
  expectedInputCode?: string;
  expectedInputMessage?: RegExp;
  expectedReadError?: RegExp;
  inputReadError?: unknown;
  baselineDecode?: ReturnType<typeof decodeBaselineYaml>;
}

Given("a supported baseline saved as {string}", function (this: BaselineInputWorld, filename: string) {
  const text = readFileSync("test/fixtures/baseline-viewer/full.yaml", "utf8");
  this.selectedBaselineFile = new File([text], filename);
  this.expectedBaseline = reviewedBaseline("full");
});

Given(/^a selected file contains (.+)$/, function (this: BaselineInputWorld, problem: string) {
  let content: string | Uint8Array<ArrayBuffer>;
  switch (problem) {
    case "invalid UTF-8":
      content = new Uint8Array([0xc3, 0x28]);
      this.expectedReadError = /valid UTF-8/;
      break;
    case "malformed YAML":
      content = "components: [\n";
      this.expectedInputCode = "invalid-encoding";
      break;
    case "duplicate mapping keys":
      content = "formatVersion: 1\nformatVersion: 1\n";
      this.expectedInputCode = "invalid-encoding";
      break;
    case "an unsupported format version":
      content = stringify({ ...baselineExample(), formatVersion: 2 });
      this.expectedInputCode = "unsupported-version";
      break;
    case "legacy diagram content":
      content = readFileSync(new URL("../fixtures/baseline-viewer/legacy.choom.yaml", import.meta.url), "utf8");
      this.expectedInputCode = "invalid-document";
      this.expectedInputMessage = /Legacy diagrams are unsupported.*formatVersion: 1/;
      break;
    case "content above the byte limit":
      content = new Uint8Array(16 * 1024 * 1024 + 1);
      this.expectedReadError = /16 MiB/;
      break;
    default:
      throw new Error(`Unknown baseline input problem: ${problem}`);
  }
  this.selectedBaselineFile = new File([content], "baseline.yaml");
});

When("its input is decoded", async function (this: BaselineInputWorld) {
  const read = await readBrowserBaseline(this.selectedBaselineFile, new AbortController().signal);
  if (read.status === "failure") {
    this.inputReadError = new Error(read.message);
    return;
  }
  this.baselineDecode = decodeBaselineYaml(read.text);
});

Then("the baseline model is returned", function (this: BaselineInputWorld) {
  assert.equal(this.inputReadError, undefined);
  assert.equal(this.baselineDecode?.status, "success", JSON.stringify(this.baselineDecode));
  assert.ok(this.baselineDecode && "baseline" in this.baselineDecode);
  assert.deepEqual(this.baselineDecode.baseline, this.expectedBaseline);
});

Then("the result identifies the input error", function (this: BaselineInputWorld) {
  if (this.expectedReadError) {
    assert.ok(this.inputReadError instanceof Error);
    assert.match(this.inputReadError.message, this.expectedReadError);
    assert.equal(this.baselineDecode, undefined);
    return;
  }
  assert.equal(this.inputReadError, undefined);
  assert.equal(this.baselineDecode?.status, "failure", JSON.stringify(this.baselineDecode));
  assert.ok(this.baselineDecode?.status === "failure");
  assert.equal(this.baselineDecode.code, this.expectedInputCode);
  assert.ok(this.baselineDecode.message.trim().length > 0);
  if (this.expectedInputMessage) assert.match(this.baselineDecode.message, this.expectedInputMessage);
});
