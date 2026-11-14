import assert from "node:assert/strict";
import { Given, Then, When, type World } from "@cucumber/cucumber";
import { readBrowserBaseline } from "../../src/platform/browser-documents.ts";
import documents from "../fixtures/baseline-viewer/document-byte-identity.json" with { type: "json" };

interface ByteIdentityWorld extends World {
  selectedFile: File;
  expectedSha256: string;
  result: Awaited<ReturnType<typeof readBrowserBaseline>>;
}

Given("a saved baseline contains a UTF-8 byte order mark and CRLF line endings", function (this: ByteIdentityWorld) {
  const original = documents.find(({ text }) => text.startsWith("\uFEFF") && text.includes("\r\n"));
  assert.ok(original);
  this.selectedFile = new File([original.text], "baseline.yaml");
  this.expectedSha256 = original.sha256;
});

When("the browser reader reads the selected baseline", async function (this: ByteIdentityWorld) {
  this.result = await readBrowserBaseline(this.selectedFile, new AbortController().signal);
});

Then("the read result includes the SHA-256 digest of the exact file bytes", function (this: ByteIdentityWorld) {
  assert.equal(this.result.status, "success");
  assert.equal("sha256" in this.result ? this.result.sha256 : undefined, this.expectedSha256);
});
