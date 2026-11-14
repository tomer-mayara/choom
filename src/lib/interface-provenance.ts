import type { AcceptedTextStatement, BaselineInterface, BaselineSourceAssessment, BaselineSourceUse, ProposedTextStatement } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";

type Metadata = ReadonlyData<Pick<ProposedTextStatement, "status" | "evidenceRefs">
  | Pick<AcceptedTextStatement, "status" | "evidenceRefs" | "acceptanceRef">>;
interface SourceStatement { path: string; label: string; status: "accepted" | "proposed"; evidenceRefs: readonly string[]; acceptanceRef?: string }
interface SourceReference { id: string; statements: SourceStatement[]; uses: ReadonlyData<BaselineSourceUse>[]; scope: boolean }

/** The paths use saved local IDs so repeated example IDs stay in their entry. */
export function interfaceSourceStatements(item: ReadonlyData<BaselineInterface>): SourceStatement[] {
  const result: SourceStatement[] = [];
  function add(path: string, label: string, statement: Metadata) {
    result.push({ path: `${item.id}.${path}`, label, status: statement.status, evidenceRefs: statement.evidenceRefs,
      ...(statement.status === "accepted" ? { acceptanceRef: statement.acceptanceRef } : {}) });
  }
  add("owner", "Provider", item.owner);
  add("publicAccess", "Entry points", item.publicAccess);
  add("allowedConsumers", "Access rule", item.allowedConsumers);
  add("promises", "Interface-wide contract", item.promises);
  const docs = item.documentation;
  if (docs) {
    add("documentation.summary", "Purpose", docs.summary);
    for (const entry of docs.entries) {
      const path = `documentation.entries.${entry.id}`;
      const name = docs.entries.some((other) => other.id !== entry.id && other.name === entry.name) ? `${entry.name} (${entry.id})` : entry.name;
      add(`${path}.kind`, `${name}: kind`, entry.kind);
      add(`${path}.description`, `${name}: description`, entry.description);
      if (entry.signature) add(`${path}.signature`, `${name}: signature`, entry.signature);
      if (entry.interaction) add(`${path}.interaction`, `${name}: interaction`, entry.interaction);
      for (const example of entry.examples) {
        const exampleName = entry.examples.some((other) => other.id !== example.id && other.name === example.name)
          ? `${example.name} (${example.id})` : example.name;
        add(`${path}.examples.${example.id}.content`, `${name}: ${exampleName} example`, example.content);
      }
    }
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
