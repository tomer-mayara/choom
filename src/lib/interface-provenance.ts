import type { BaselineDocumentation, BaselineInterface, BaselineSourceAssessment, BaselineSourceUse } from "@choom/baseline-model/contracts";
import { documentationStatements, type DocumentationStatement, itemStatementFields, type StatementState }
  from "@choom/baseline-model/item-statements";
import type { ReadonlyData } from "@choom/baseline-model/readonly-data";

interface SourceStatement { path: string; label: string; status: "accepted" | "proposed"; evidenceRefs: readonly string[]; acceptanceRef?: string }
interface SourceReference { id: string; statements: SourceStatement[]; uses: ReadonlyData<BaselineSourceUse>[]; scope: boolean }
interface Named { readonly id: string; readonly name: string }

const legacyLabels: Readonly<Record<typeof itemStatementFields.interfaces[number], string>> = {
  owner: "Provider", publicAccess: "Interface entries", allowedConsumers: "Access rule", promises: "Interface-wide contract",
};

// A name that repeats in its list gets its ID, so that each label is distinct.
function distinctName(items: readonly Named[], item: Named): string {
  return items.some((other) => other.id !== item.id && other.name === item.name) ? `${item.name} (${item.id})` : item.name;
}

function documentationLabel(docs: ReadonlyData<BaselineDocumentation>, { part, entry, example }: DocumentationStatement): string {
  if (entry === undefined) return "Purpose";
  const name = distinctName(docs.entries, entry);
  return example === undefined ? `${name}: ${part}` : `${name}: ${distinctName(entry.examples, example)} example`;
}

/** The paths use saved local IDs so repeated example IDs stay in their entry. */
export function interfaceSourceStatements(item: ReadonlyData<BaselineInterface>): SourceStatement[] {
  const result: SourceStatement[] = [];
  function add(path: string, label: string, statement: StatementState) {
    result.push({ path: `${item.id}.${path}`, label, status: statement.status, evidenceRefs: statement.evidenceRefs,
      ...(statement.status === "accepted" ? { acceptanceRef: statement.acceptanceRef } : {}) });
  }
  for (const field of itemStatementFields.interfaces) add(field, legacyLabels[field], item[field]);
  const docs = item.documentation;
  if (docs) {
    for (const statement of documentationStatements(docs)) add(statement.field, documentationLabel(docs, statement), statement.statement);
  }
  return result;
}

export function projectInterfaceSources(item: ReadonlyData<BaselineInterface>, assessment?: ReadonlyData<BaselineSourceAssessment>) {
  const statements = interfaceSourceStatements(item);
  const notes = item.documentation?.sourceNotes ?? [];
  const byId = new Map<string, SourceReference>();
  function referenceFor(id: string): SourceReference {
    const reference = byId.get(id) ?? { id, statements: [], uses: [], scope: false };
    byId.set(id, reference);
    return reference;
  }
  for (const statement of statements) for (const id of new Set(statement.evidenceRefs)) {
    referenceFor(id).statements.push(statement);
  }
  for (const id of assessment?.evidenceRefs ?? []) referenceFor(id).scope = true;
  for (const use of assessment?.uses ?? []) for (const id of new Set(use.evidenceRefs)) referenceFor(id).uses.push(use);
  return { statements, references: [...byId.values()],
    notes: notes.map((note) => ({ note, statements: byId.get(note.evidenceRef)?.statements ?? [] })),
    usageNotes: (assessment?.sourceNotes ?? []).map((note) => ({
      note, uses: byId.get(note.evidenceRef)?.uses ?? [], scope: byId.get(note.evidenceRef)?.scope ?? false,
    })) };
}
