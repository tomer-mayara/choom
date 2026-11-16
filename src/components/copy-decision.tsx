import { createContext, useContext, useMemo } from "react";
import type { Baseline } from "@choom/baseline-model/contracts";
import { baselineStatements, type StatementState } from "@choom/baseline-model/item-statements";
import type { ReadonlyData } from "@choom/baseline-model/readonly-data";
import { decisionEntryText } from "../lib/decision-entry.ts";
import { Button } from "./ui/button.tsx";
import { type CopyMessages, useExampleCopy } from "./use-example-copy.ts";

/** The saved baseline file that a copied decision names, with its statements by name (`<itemId>.<field>`). */
export interface DecisionBaseline {
  readonly id: string;
  readonly sha256: string;
  readonly statements: ReadonlyMap<string, StatementState>;
}

/** A view of a saved baseline file provides it. The built-in example has no file digest, so it has none. */
export const DecisionContext = createContext<DecisionBaseline | null>(null);

/** The decision binding of a saved baseline file, or null without a file digest. */
export function useDecisionBaseline(baseline: ReadonlyData<Baseline>, sha256: string | undefined): DecisionBaseline | null {
  return useMemo(() => sha256 === undefined ? null : { id: baseline.id, sha256,
    statements: new Map(baselineStatements(baseline).map(({ itemId, field, statement }) => [`${itemId}.${field}`, statement])) },
  [baseline, sha256]);
}

const decisionMessages: CopyMessages = {
  copying: "Copying decision…", copied: "Decision copied.", failed: "Could not copy. Select the decision text and copy it manually.",
};

/**
 * Copies a decision-file entry that accepts one proposed statement of the open
 * baseline file. The shared statement list decides what a statement is. An
 * accepted statement cannot get another decision, so it has no action. Copying
 * changes no file and not the open baseline.
 */
export function CopyDecision({ itemId, field }: { itemId: string; field: string }) {
  const baseline = useContext(DecisionContext);
  const copy = useExampleCopy(decisionMessages);
  const statement = baseline?.statements.get(`${itemId}.${field}`);
  if (!baseline || statement?.status !== "proposed") return null;
  const text = decisionEntryText(baseline, itemId, field);
  return <div className="space-y-1">
    <Button variant="outline" className="h-8 px-3 text-xs" aria-label={`Copy decision for ${itemId}.${field}`}
      onClick={() => { void copy.write(text); }}>
      Copy decision
    </Button>
    <p role="status" className="text-xs text-muted-foreground">{copy.feedback}</p>
    {copy.feedback === decisionMessages.failed
      ? <pre className="select-text rounded-lg border border-border bg-muted p-2 whitespace-pre-wrap wrap-anywhere text-xs">{text}</pre> : null}
  </div>;
}
