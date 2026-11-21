import type { Baseline, DiscoveryResult, IsolationComparison, IsolationInput } from "@choom/baseline-model/contracts";
import type { DuplicationReport } from "../domain/generated/contracts.ts";
import type { ArchitectureLayout } from "../lib/architecture-layout.ts";
import type { WorkflowOutcome, WorkflowState } from "./generated/workflow.ts";
import type { LoadWorkflowSnapshot } from "./workspace-view.ts";

/** Copy validated data once and deeply freeze the copy, so that no observer can change what a snapshot publishes. */
function ownedCopy<Value>(value: Value): Value {
  const copy = structuredClone(value);
  const pending: unknown[] = [copy];
  while (pending.length > 0) {
    const item = pending.pop();
    if (typeof item !== "object" || item === null || Object.isFrozen(item)) continue;
    Object.freeze(item);
    for (const child of Object.values(item)) pending.push(child);
  }
  return copy;
}

/** Copy the validated baseline and prepared positions once, before the view commit. */
export function ownCurrentView(baseline: Baseline, layout: ArchitectureLayout, sha256: string,
  production: { baseline: Baseline; layout: ArchitectureLayout }): NonNullable<LoadWorkflowSnapshot["current"]> {
  return ownedCopy({ baseline, layout, sha256, production });
}

/** Copy mutable scalar outcomes; preserve frozen outcomes across state updates. */
export function ownOutcome<Outcome extends WorkflowOutcome>(outcome: Outcome): Readonly<Outcome> {
  if (Object.isFrozen(outcome)) return outcome;
  const owned: Outcome = { ...outcome };
  return Object.freeze(owned);
}

export function ownDuplication(report: DuplicationReport, session: number): NonNullable<LoadWorkflowSnapshot["duplication"]> {
  return ownedCopy({ report, session });
}

export function ownDiscovery(result: DiscoveryResult): NonNullable<LoadWorkflowSnapshot["discovery"]> {
  return ownedCopy({ result });
}

export function ownComparison(before: IsolationInput, result: IsolationComparison): NonNullable<LoadWorkflowSnapshot["comparison"]> {
  return ownedCopy({ before, result });
}

/** The published baseline view and its attachments. */
export type PublishedViews = Pick<LoadWorkflowSnapshot, "current" | "duplication" | "discovery" | "comparison">;

export function publishedSnapshot(state: WorkflowState,
  { current, duplication, discovery, comparison }: PublishedViews = { current: null, duplication: null, discovery: null, comparison: null }): LoadWorkflowSnapshot {
  return Object.freeze({
    state: Object.freeze({
      ...state,
      lastOutcome: state.lastOutcome === null ? null : ownOutcome(state.lastOutcome),
    }),
    current,
    duplication,
    discovery,
    comparison,
  });
}
