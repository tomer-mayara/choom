import type {
  Baseline, BaselineDocumentation, BaselineDocumentationExample, BaselineDocumentedEntry,
} from "./generated/contracts.ts";
import type { ReadonlyData } from "./readonly-data.ts";

// The statements of baseline items and their paths. A statement is an item field
// whose value has a status and evidence references. The decision checks, the
// producer record checks and the viewer name a statement <itemId>.<field>, with
// the field paths that discovery questions and gaps also use, such as
// documentation.entries.decode.kind. The lists hold the statement objects of the
// given baseline, not copies.

/** The parts of a statement that the callers read. */
export interface StatementState {
  readonly value: unknown;
  readonly status: "proposed" | "accepted";
  readonly evidenceRefs: readonly string[];
  readonly acceptanceRef?: string;
}

/** The item fields that hold one statement each, in the order of the baseline contract. `parent` is optional. */
export const itemStatementFields = {
  components: ["purpose", "membership", "groupingReason", "parent"],
  interfaces: ["owner", "publicAccess", "allowedConsumers", "promises"],
  resources: ["identity", "owner", "accessRules"],
  rules: ["subject", "expected", "check"],
} as const;

/** The part of interface documentation that holds a documentation statement. */
export type DocumentationPart = "summary" | "kind" | "description" | "signature" | "interaction" | "example";

/** A statement of interface documentation, its path in the interface, and the entry and example that hold it. */
export interface DocumentationStatement {
  readonly field: string;
  readonly part: DocumentationPart;
  readonly statement: StatementState;
  readonly entry?: ReadonlyData<BaselineDocumentedEntry>;
  readonly example?: ReadonlyData<BaselineDocumentationExample>;
}

/** One statement of a baseline: the ID of its component, interface, resource or rule, and its path in that item. */
export interface BaselineStatement {
  readonly itemId: string;
  readonly field: string;
  readonly statement: StatementState;
}

/** The statements of version 2 to 5 interface documentation, in the order of the documentation. */
export function documentationStatements(documentation: ReadonlyData<BaselineDocumentation>): DocumentationStatement[] {
  const statements: DocumentationStatement[] = [{ field: "documentation.summary", part: "summary", statement: documentation.summary }];
  for (const entry of documentation.entries) {
    const path = `documentation.entries.${entry.id}`;
    const parts = [["kind", entry.kind], ["description", entry.description], ["signature", entry.signature],
      ["interaction", entry.interaction]] as const;
    for (const [part, statement] of parts) {
      if (statement !== undefined) statements.push({ field: `${path}.${part}`, part, statement, entry });
    }
    for (const example of entry.examples) {
      statements.push({ field: `${path}.examples.${example.id}.content`, part: "example", statement: example.content, entry, example });
    }
  }
  return statements;
}

/** Every statement of the baseline, in the order of the baseline. */
export function baselineStatements(baseline: ReadonlyData<Baseline>): BaselineStatement[] {
  const statements: BaselineStatement[] = [];
  const add = (itemId: string, field: string, statement: StatementState | undefined): void => {
    if (statement !== undefined) statements.push({ itemId, field, statement });
  };
  for (const item of baseline.components) for (const field of itemStatementFields.components) add(item.id, field, item[field]);
  for (const item of baseline.interfaces) {
    for (const field of itemStatementFields.interfaces) add(item.id, field, item[field]);
    if ("documentation" in item && item.documentation) {
      for (const { field, statement } of documentationStatements(item.documentation)) add(item.id, field, statement);
    }
  }
  for (const item of baseline.resources) for (const field of itemStatementFields.resources) add(item.id, field, item[field]);
  for (const item of baseline.rules) for (const field of itemStatementFields.rules) add(item.id, field, item[field]);
  return statements;
}
