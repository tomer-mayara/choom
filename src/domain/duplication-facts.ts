import type {
  Baseline, BaselineDocumentedEntry, BaselineInterface, DuplicationFactField, DuplicationRecordedFact, DuplicationResolvedFact,
} from "./generated/contracts.ts";
import type { ReadonlyData } from "./readonly-data.ts";

function savedFact(statement: {
  status: "proposed" | "accepted"; evidenceRefs: readonly string[]; acceptanceRef?: string;
}, value: string | null): DuplicationResolvedFact {
  return {
    value, status: statement.status, evidenceRefs: [...statement.evidenceRefs],
    ...(statement.acceptanceRef === undefined ? {} : { acceptanceRef: statement.acceptanceRef }),
  };
}

function promiseFact(item: ReadonlyData<BaselineInterface>, field: DuplicationFactField): DuplicationResolvedFact | undefined {
  switch (field) {
    case "promises.behavior": return savedFact(item.promises, item.promises.value?.behavior ?? null);
    case "promises.data": return savedFact(item.promises, item.promises.value?.data ?? null);
    case "promises.errors": return savedFact(item.promises, item.promises.value?.errors ?? null);
    case "promises.lifecycle": return savedFact(item.promises, item.promises.value?.lifecycle ?? null);
    default: return undefined;
  }
}

function interactionFact(entry: ReadonlyData<BaselineDocumentedEntry>, field: DuplicationFactField): DuplicationResolvedFact | undefined {
  const statement = entry.interaction;
  if (!statement) return undefined;
  switch (field) {
    case "interaction.input": return savedFact(statement, statement.value.input);
    case "interaction.success": return savedFact(statement, statement.value.success);
    case "interaction.failures": return savedFact(statement, statement.value.failures);
    case "interaction.effects": return savedFact(statement, statement.value.effects);
    default: return undefined;
  }
}

function entryFact(entry: ReadonlyData<BaselineDocumentedEntry>, field: DuplicationFactField): DuplicationResolvedFact | undefined {
  switch (field) {
    case "description": return savedFact(entry.description, entry.description.value);
    case "signature": return entry.signature ? savedFact(entry.signature, entry.signature.value) : undefined;
    case "kind": return savedFact(entry.kind, entry.kind.value);
    default: return interactionFact(entry, field);
  }
}

/** Resolve recorded fields without extracting new assertions from prose. */
export function resolveDuplicationRecordedFact(baseline: ReadonlyData<Baseline>, fact: ReadonlyData<DuplicationRecordedFact>): DuplicationResolvedFact | undefined {
  const item: ReadonlyData<BaselineInterface> | undefined = baseline.interfaces.find((record) => record.id === fact.endpoint.interfaceId);
  if (!item) return undefined;
  const documentation = baseline.formatVersion !== 1 ? item.documentation : undefined;
  const entry = documentation?.entries.find((record) => record.id === fact.endpoint.entryId);
  if (fact.endpoint.entryId !== undefined && !entry) return undefined;
  if (fact.field === "summary") return documentation ? savedFact(documentation.summary, documentation.summary.value) : undefined;
  const promise = promiseFact(item, fact.field);
  return promise ?? (entry ? entryFact(entry, fact.field) : undefined);
}
