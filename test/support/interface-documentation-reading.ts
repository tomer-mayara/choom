import assert from "node:assert/strict";
import type { Baseline, BaselineDocumentedEntry, BaselineInterface } from "../../src/domain/generated/contracts.ts";

export interface PublishedEntry { item: BaselineInterface; entry: BaselineDocumentedEntry }
export interface SignatureReading {
  state: string | null;
  literal: string | null;
  statement: string | null;
  references: Array<{ id: string; paths: string[] }>;
}
export interface PublishedReading {
  interfaceId: string;
  entryId: string;
  overview: string;
  facts: Record<string, string>;
  signature: SignatureReading;
  interaction: string | null;
  examples: Array<{ id: string; text: string; sample: string; input: string | null; result: string | null; resultScope: string | null; outcome: string | null }>;
  sources: string;
  original: unknown;
  access: string;
}
export interface ReadingDrawing {
  camera: string | null;
  nodes: Array<{ id: string | null; transform: string; width: string; height: string }>;
  arcs: Array<{ id: string | null; consumer: string | null; owner: string | null }>;
}

/** Read rendered positions and connections without changing the drawing. */
export function readRenderedDrawing(): ReadingDrawing {
  return {
    camera: document.querySelector<HTMLElement>(".react-flow__viewport")?.style.transform ?? null,
    nodes: Array.from(document.querySelectorAll<HTMLElement>(".react-flow__node[data-id]"), (node) => ({
      id: node.getAttribute("data-id"), transform: node.style.transform, width: node.style.width, height: node.style.height,
    })),
    arcs: Array.from(document.querySelectorAll<SVGPathElement>("path[data-interface-arc]"), (arc) => ({
      id: arc.getAttribute("data-interface-id"), consumer: arc.getAttribute("data-consumer-id"), owner: arc.getAttribute("data-owner-id"),
    })),
  };
}

export function publishedReadingEntries(baseline: Baseline): PublishedEntry[] {
  assert.equal(baseline.formatVersion, 2);
  const entries = baseline.interfaces.flatMap((item) => (item.documentation?.entries ?? []).map((entry) => ({ item, entry })));
  const callable = entries.find(({ entry }) => entry.kind.value === "function"
    && entry.examples.some(({ content }) => content.value.result?.scope === "excerpt"));
  const type = entries.find(({ entry }) => entry.kind.value === "type" && entry.examples.length === 0);
  const data = entries.find(({ entry }) => entry.kind.value === "data" && entry.examples.length > 0);
  assert.ok(callable && type && data, "The published fixture must contain the agreed function, type, and data reading tasks");
  assert.equal(callable.entry.signature?.value, "export function decodeBaselineYaml(text: string): DecodeBaselineOutcome",
    "The final published fixture must include the reviewed decoder declaration, including its parameter and return type");
  return [callable, type, data];
}

const statusLabel = (status: "proposed" | "accepted") => status === "accepted" ? "Accepted (recorded)" : "Proposed";
const normalized = (value: string) => value.replace(/\s+/g, " ").trim();
function contains(actual: string, expected: string, label: string) {
  assert.ok(normalized(actual).includes(normalized(expected)), `${label} must retain the saved text: ${expected}`);
}


/** Observe rendered source statements after the user opens the Sources disclosures. */
export function readSignatureSourceMetadata(path: string) {
  const statements = Array.from(document.querySelectorAll<HTMLElement>('details[data-section="interface-statements"] > ul > li'));
  const statement = statements.find((element) => element.querySelector(":scope > code")?.textContent === path);
  const references = Array.from(document.querySelectorAll<HTMLElement>('details[data-section="interface-evidence"] > div > ul > li'), (element) => ({
    id: element.querySelector(":scope > code")?.textContent ?? "",
    paths: Array.from(element.querySelectorAll("ul code"), (code) => code.textContent ?? ""),
  })).filter((reference) => reference.paths.includes(path));
  return { statement: statement?.innerText ?? null, references };
}

export function expectSignatureReading(item: BaselineInterface, entry: BaselineDocumentedEntry, reading: SignatureReading): void {
  if (entry.kind.value !== "function") {
    assert.equal(reading.state, null, "Non-function entries have no method-signature block");
    assert.equal(reading.literal, null);
    assert.equal(reading.statement, null);
    assert.deepEqual(reading.references, []);
    return;
  }
  assert.ok(reading.state, "A function must explain whether its signature is recorded");
  if (!entry.signature) {
    contains(reading.state, "Signature not recorded", "Missing signature");
    assert.equal(reading.literal, null);
    assert.equal(reading.statement, null);
    assert.deepEqual(reading.references, []);
    return;
  }
  assert.equal(reading.literal, entry.signature.value, "Signature syntax and line breaks must be saved literally");
  if (entry.signature.value === null) contains(reading.state, "Signature is unknown", "Unknown signature");
  contains(reading.state, statusLabel(entry.signature.status), "Signature status");
  assert.ok(reading.statement, "Signature metadata must have its own source statement");
  const path = `${item.id}.documentation.entries.${entry.id}.signature`;
  contains(reading.statement, path, "Signature statement path");
  contains(reading.statement, statusLabel(entry.signature.status), "Signature source status");
  if (entry.signature.status === "accepted") contains(reading.statement, entry.signature.acceptanceRef, "Signature acceptance reference");
  assert.deepEqual(reading.references.map(({ id }) => id).sort(), [...new Set(entry.signature.evidenceRefs)].sort());
  for (const reference of reading.references) assert.ok(reference.paths.includes(path), "Each own signature reference must name the signature path");
}

export function expectPublishedReadings(baseline: Baseline, readings: PublishedReading[]): void {
  const targets = publishedReadingEntries(baseline);
  assert.equal(readings.length, targets.length);
  for (const [index, { item, entry }] of targets.entries()) {
    const reading = readings[index];
    assert.ok(reading);
    assert.equal(reading.interfaceId, item.id);
    assert.equal(reading.entryId, entry.id);
    const owner = baseline.components.find(({ id }) => id === item.owner.value);
    contains(reading.facts.Provider ?? "", owner?.name ?? "Provider unknown", "Provider");
    contains(reading.facts.Provider ?? "", statusLabel(item.owner.status), "Provider status");
    contains(reading.facts.Purpose ?? "", item.documentation?.summary.value ?? "Unknown", "Purpose");
    assert.ok(item.documentation);
    contains(reading.facts.Purpose ?? "", statusLabel(item.documentation.summary.status), "Purpose status");
    contains(reading.overview, entry.name, "Selected entry");
    contains(reading.facts["Entry reference"] ?? "", entry.accessPoint, "Entry reference");
    contains(reading.facts.Kind ?? "", entry.kind.value ?? "unknown", "Kind");
    contains(reading.facts.Kind ?? "", statusLabel(entry.kind.status), "Kind status");
    contains(reading.facts.Description ?? "", entry.description.value ?? "unknown", "Description");
    contains(reading.facts.Description ?? "", statusLabel(entry.description.status), "Description status");
    expectSignatureReading(item, entry, reading.signature);
    if (entry.interaction) {
      assert.ok(reading.interaction, "Callable interaction facts must be visible");
      contains(reading.interaction, statusLabel(entry.interaction.status), "Interaction status");
      for (const [key, name] of [["input", "Input"], ["success", "Success"], ["failures", "Failures"], ["effects", "Effects"]] as const) {
        contains(reading.facts[name] ?? "", entry.interaction.value[key] ?? "Unknown", name);
      }
    } else assert.equal(reading.interaction, null, "A type or data entry must not acquire a callable interaction");
    expectExamples(entry, reading.examples);
    expectSourcesAndAccess(baseline, item, reading);
  }
}


function expectExamples(entry: BaselineDocumentedEntry, readings: PublishedReading["examples"]): void {
  assert.equal(readings.length, entry.examples.length);
  for (const [exampleIndex, example] of entry.examples.entries()) {
    const observed: PublishedReading["examples"][number] | undefined = readings[exampleIndex];
    assert.ok(observed);
    assert.equal(observed.id, example.id);
    assert.equal(observed.sample, example.content.value.text);
    assert.equal(observed.input, example.content.value.input ?? null);
    assert.equal(observed.result, example.content.value.result?.text ?? null);
    contains(observed.text, example.name, "Selected example");
    if (example.content.value.result) {
      assert.ok(observed.outcome);
      contains(observed.outcome, example.content.value.result.summary, "Result explanation");
      assert.equal(observed.resultScope, example.content.value.result.scope === "excerpt" ? "Result excerpt" : "Complete recorded result");
    } else {
      assert.equal(observed.outcome, null);
      assert.equal(observed.resultScope, null);
      contains(observed.text, "No result recorded for this example.", "Missing result");
    }
    if (example.content.value.input === undefined) contains(observed.text, "No input recorded for this example.", "Missing input");
    contains(observed.text, example.basis === "source-reviewed" ? "Source-reviewed (recorded)" : "Illustrative example", "Recorded basis");
    contains(observed.text, statusLabel(example.content.status), "Example status");
    contains(observed.text, "Choom has not run this example.", "Prepared example disclosure");
  }
}

function expectSourcesAndAccess(baseline: Baseline, item: BaselineInterface, reading: PublishedReading): void {
  for (const note of item.documentation?.sourceNotes ?? []) {
    contains(reading.sources, note.description, "Source note");
    contains(reading.sources, note.evidenceRef, "Source reference");
    if (note.location) {
      for (const value of [note.location.path, note.location.snapshotRef, note.location.sha256]) contains(reading.sources, value, "Saved source location");
    }
  }
  assert.deepEqual(reading.original, item, "Original record must retain the complete published interface");
  if (item.allowedConsumers.value === null) contains(reading.access, "Permitted components are not recorded.", "Unknown access rule");
  else for (const id of item.allowedConsumers.value) {
    const consumer = baseline.components.find((component) => component.id === id);
    assert.ok(consumer);
    contains(reading.access, consumer.name, "Permitted component");
  }
  contains(reading.access, statusLabel(item.allowedConsumers.status), "Access rule status");
  contains(reading.access, "Call activity is not recorded.", "Permission meaning");
  contains(reading.access, "not runtime authorization", "Permission meaning");
}
