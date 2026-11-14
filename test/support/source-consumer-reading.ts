import assert from "node:assert/strict";
import type { BaselineDocumentedEntry, BaselineInterface, BaselineSourceNote, BaselineV3 } from "../../src/domain/generated/contracts.ts";
import { expectSignatureReading, type ReadingDrawing, type SignatureReading } from "./interface-documentation-reading.ts";

const workspace = "s4-001-workspace";
const model = "s4-001-architecture-model";
const adapter = "s4-001-desktop-adapter";
const native = "s4-001-native-shell";

/** Expected relations from the bounded saved-source review, independent of the viewer projection. */
export const reviewedCrossConnections: ReadingDrawing["arcs"] = ([
  ["s4-001-baseline-model", workspace, model],
  ["s4-001-browser-file-input", workspace, adapter],
  ["s4-001-desktop-selection", workspace, adapter],
  ["s4-001-desktop-file-read", workspace, adapter],
  ["s4-001-native-file-read", adapter, native],
] as const).map(([id, consumer, owner]) => ({ id, consumer, owner }));
export const reviewedSelfConnections: ReadingDrawing["arcs"] = ([
  ["s4-001-load-workflow", workspace], ["s4-001-baseline-decoder", workspace],
  ["s4-001-prepared-layout", workspace], ["s4-001-interface-inspection", workspace],
  ["s4-001-desktop-selection", adapter], ["s4-001-native-file-read", native],
] as const).map(([id, consumer]) => ({ id, consumer, owner: consumer }));

export interface SourceConsumerReading {
  interfaceId: string;
  overview: string;
  rows: Array<{ id: string; text: string; caller: string }>;
  access: string;
  sourceReview: string;
  sourceRecord: unknown;
  original: unknown;
  entries: Array<{ id: string; signature: SignatureReading; examples: Array<{ id: string; sample: string; text: string }> }>;
}

export function expectReviewedFixture(baseline: BaselineV3): void {
  assert.equal(baseline.interfaces.length, 10);
  assert.ok(baseline.sourceUsage);
  assert.equal(baseline.sourceUsage.assessments.length, 10);
  assert.ok(baseline.interfaces.every(({ allowedConsumers }) => allowedConsumers.value === null),
    "The bounded review keeps all ten permission policies unknown");
  const entries = baseline.interfaces.flatMap((item) => item.documentation?.entries ?? []);
  assert.equal(entries.length, 28);
  assert.equal(entries.filter((entry) => entry.kind.value === "function" && typeof entry.signature?.value === "string").length, 20);
  assert.equal(entries.filter((entry) => entry.kind.value === "function" && entry.signature?.value === null).length, 1);
  assert.equal(entries.filter((entry) => entry.kind.value !== "function").length, 7);
}

export function expectReviewedConnections(drawing: ReadingDrawing, expected: ReadingDrawing["arcs"]): void {
  const key = ({ id, consumer, owner }: ReadingDrawing["arcs"][number]) => JSON.stringify([id, consumer, owner]);
  const ordered = (arcs: ReadingDrawing["arcs"]) => [...arcs].sort((left, right) => key(left).localeCompare(key(right)));
  assert.deepEqual(ordered(drawing.arcs), ordered(expected), "Every shown arc must have its reviewed interface, consumer, and provider");
}

/** Read only visible Overview content after the user opens caller disclosures. */
export function readSourceUseOverview() {
  const view = document.querySelector<HTMLElement>('[role="tabpanel"][data-state="active"]');
  return {
    overview: view?.innerText ?? "",
    rows: Array.from(view?.querySelectorAll<HTMLElement>("li[data-use-id]") ?? [], (row) => ({
      id: row.dataset.useId ?? "", text: row.innerText,
      caller: row.querySelector<HTMLElement>("details[open]")?.innerText ?? "",
    })),
  };
}

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
function includes(actual: string, expected: string, label: string): void {
  assert.ok(normalize(actual).includes(normalize(expected)), `${label} must retain ${expected}`);
}

export function expectSourceConsumerReading(baseline: BaselineV3, item: BaselineInterface, reading: SourceConsumerReading): void {
  assert.ok(baseline.sourceUsage);
  const assessment = baseline.sourceUsage.assessments.find(({ interfaceId }) => interfaceId === item.id);
  assert.ok(assessment);
  assert.equal(reading.interfaceId, item.id);
  assert.match(reading.overview, /interface-wide/i);
  assert.deepEqual(reading.rows.map(({ id }) => id).sort(), assessment.uses.map(({ id }) => id).sort());
  for (const use of assessment.uses) {
    const row = reading.rows.find(({ id }) => id === use.id);
    assert.ok(row);
    includes(row.text, use.description, "Use description");
    includes(row.text.toLowerCase(), use.kind, "Use kind");
    includes(row.text.toLowerCase(), use.context, "Use context");
    if (use.accessPoint) includes(row.text, use.accessPoint, "Entry access point");
    if (use.entryId) {
      const entry = item.documentation?.entries.find(({ id }) => id === use.entryId);
      assert.ok(entry);
      includes(row.text, entry.name, "Bound entry name");
    }
    const component = baseline.components.find(({ id }) => id === use.consumerId);
    if (component) includes(reading.overview, component.name, "Source consumer name");
    const caller: BaselineSourceNote | undefined = assessment.sourceNotes.find(({ evidenceRef }) => evidenceRef === use.callerRef);
    assert.ok(caller?.location);
    includes(row.caller, caller.description, "Caller note");
    for (const value of [caller.location.path, caller.location.snapshotRef, caller.location.sha256,
      `Lines ${caller.location.lines[0]}–${caller.location.lines[1]}`]) includes(row.caller, value, "Caller location");
  }
  if (!assessment.uses.length) includes(reading.overview, "No uses found in the reviewed scope.", "Scoped empty list");
  for (const value of [baseline.sourceUsage.snapshotRef, baseline.sourceUsage.mappingRef, assessment.scope, ...assessment.limitations]) {
    includes(reading.sourceReview, value, "Source review scope");
  }
  for (const note of assessment.sourceNotes) {
    includes(reading.sourceReview, note.description, "Source evidence note");
    if (note.location) for (const value of [note.location.path, note.location.sha256,
      `Lines ${note.location.lines[0]}–${note.location.lines[1]}`]) includes(reading.sourceReview, value, "Source evidence location");
  }
  assert.deepEqual(reading.sourceRecord, { snapshotRef: baseline.sourceUsage.snapshotRef, mappingRef: baseline.sourceUsage.mappingRef, assessment });
  assert.deepEqual(reading.original, item);
  includes(reading.access, "Permitted components are not recorded.", "Unknown permission");
  includes(reading.access, "Runtime execution is not recorded.", "Execution meaning");
  assert.equal(reading.entries.length, item.documentation?.entries.length ?? 0);
  for (const entry of item.documentation?.entries ?? []) expectEntryReading(item, entry, reading);
}

function expectEntryReading(item: BaselineInterface, entry: BaselineDocumentedEntry, reading: SourceConsumerReading): void {
  const observed = reading.entries.find(({ id }) => id === entry.id);
  assert.ok(observed);
  expectSignatureReading(item, entry, observed.signature);
  assert.equal(observed.examples.length, entry.examples.length);
  for (const example of entry.examples) {
    const shown: { id: string; sample: string; text: string } | undefined = observed.examples.find(({ id }) => id === example.id);
    assert.ok(shown);
    assert.equal(shown.sample, example.content.value.text);
    includes(shown.text, "Choom has not run this example.", "Example execution meaning");
  }
}
