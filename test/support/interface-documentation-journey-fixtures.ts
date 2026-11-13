import assert from "node:assert/strict";
import { baselineSchema } from "../../src/domain/baseline.ts";
import type { Baseline, BaselineV2 } from "../../src/domain/generated/contracts.ts";
import { checkBaselineDisplayLimits } from "../../src/lib/baseline-display-limits.ts";
import { proposed } from "./baseline-fixtures.ts";
import { baselineWithComponents, baselineWithLinks } from "./baseline-layout-fixtures.ts";
import { baselineWithSignature, documentationAtBudget } from "./interface-documentation-fixtures.ts";

/** Put the full documentation budget in one interface, with one maximum-sized final sample. */
function singleInterfaceDocumentationAtLimit(): BaselineV2 {
  const baseline = baselineSchema.parse(documentationAtBudget(2 * 1024 * 1024));
  assert.equal(baseline.formatVersion, 2);
  baseline.id = "single-interface-documentation-limit";
  baseline.resources = [];
  baseline.rules = [];
  const item = baseline.interfaces[0];
  assert.ok(item?.documentation);
  const entries = item.documentation.entries;
  const first = entries[0]?.examples[0];
  const last = entries.at(-1)?.examples.at(-1);
  assert.ok(first && last);
  // Keep a complete maximum-sized sample at the final choice without changing the budget.
  const spare = 16 * 1024 - last.content.value.text.length;
  first.content.value.text = first.content.value.text.slice(0, first.content.value.text.length - spare);
  last.content.value.text = "last-example:" + "x".repeat(16 * 1024 - "last-example:".length);
  const authored = baselineWithSignature();
  const firstEntry = entries[0];
  const lastEntry = entries.at(-1);
  assert.ok(firstEntry && lastEntry);
  firstEntry.signature = structuredClone(authored.entry.signature);
  lastEntry.signature = structuredClone(authored.entry.signature);
  const declarationNote = authored.input.interfaces[0]?.documentation.sourceNotes.find(({ evidenceRef }) => evidenceRef === "invoice-declaration");
  assert.ok(declarationNote);
  item.documentation.sourceNotes.push(structuredClone(declarationNote));
  let excess = new TextEncoder().encode(JSON.stringify([item.documentation])).byteLength - 2 * 1024 * 1024;
  for (const entry of entries) for (const example of entry.examples) {
    if (example === last || excess === 0) continue;
    const removal = Math.min(excess, example.content.value.text.length - 1);
    example.content.value.text = example.content.value.text.slice(0, example.content.value.text.length - removal);
    excess -= removal;
  }
  assert.equal(excess, 0);
  assert.equal(new TextEncoder().encode(JSON.stringify([item.documentation])).byteLength, 2 * 1024 * 1024);
  const parsed = baselineSchema.parse(baseline);
  checkBaselineDisplayLimits(parsed);
  assert.equal(parsed.formatVersion, 2);
  return parsed;
}

/** Reach the existing display bounds with the full documentation budget in interface-0. */
export function interfaceDocumentationAtLimits(): BaselineV2 {
  const baseline: BaselineV2 = { ...baselineWithLinks(2_000), formatVersion: 2 };
  const documented = singleInterfaceDocumentationAtLimit().interfaces[0];
  assert.ok(documented);
  const item = baseline.interfaces[0];
  assert.ok(item);
  baseline.formatVersion = 2;
  baseline.id = "interface-documentation-supported-limits";
  const componentCount = 500 - baseline.interfaces.length;
  baseline.components.push(...baselineWithComponents(componentCount).components.slice(baseline.components.length));
  for (let index = 1; index < 16; index += 1) {
    const component = baseline.components[index];
    assert.ok(component);
    component.parent = proposed(`component-${index - 1}`);
  }
  item.publicAccess = structuredClone(documented.publicAccess);
  item.documentation = structuredClone(documented.documentation);
  assert.equal(baseline.interfaces.filter(({ documentation }) => documentation).length, 1);
  assert.equal(baseline.components.length + baseline.interfaces.length, 500);
  assert.equal(baseline.interfaces.reduce((sum, value) => sum + 1 + (value.allowedConsumers.value?.length ?? 0), 0), 2_000);
  const parsed = baselineSchema.parse(baseline);
  checkBaselineDisplayLimits(parsed);
  assert.equal(parsed.formatVersion, 2);
  return parsed;
}

/** Author explicit signature states; do not derive declarations from prose or examples. */
export function signatureReadingBaseline(state: "known" | "unknown" | "missing"): BaselineV2 {
  const baseline: Baseline = baselineSchema.parse(baselineWithSignature().input);
  assert.equal(baseline.formatVersion, 2);
  const item = baseline.interfaces[0];
  const entry = item?.documentation?.entries[0];
  assert.ok(item?.documentation && entry?.signature);
  if (state === "unknown") entry.signature.value = null;
  if (state === "missing") {
    delete entry.signature;
    item.documentation.sourceNotes = item.documentation.sourceNotes.filter(({ evidenceRef }) => evidenceRef !== "invoice-declaration");
  }
  const parsed = baselineSchema.parse(baseline);
  assert.equal(parsed.formatVersion, 2);
  return parsed;
}
