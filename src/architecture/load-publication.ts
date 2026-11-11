import type { Baseline } from "../domain/generated/contracts.ts";
import type { ArchitectureLayout } from "../lib/architecture-layout.ts";
import type { WorkflowOutcome, WorkflowState } from "./generated/workflow.ts";
import type { LoadWorkflowSnapshot } from "./workspace-view.ts";

/** Copy the validated baseline and prepared positions once, before the view commit. */
export function ownCurrentView(baseline: Baseline, layout: ArchitectureLayout): NonNullable<LoadWorkflowSnapshot["current"]> {
  const current = structuredClone({ baseline, layout });
  const pending: object[] = [current];
  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || Object.isFrozen(value)) continue;
    Object.freeze(value);
    const children: unknown[] = Object.values(value);
    for (const child of children) {
      if (typeof child === "object" && child !== null) pending.push(child);
    }
  }
  return current;
}

/** Copy mutable scalar outcomes; preserve frozen outcomes across state updates. */
export function ownOutcome<Outcome extends WorkflowOutcome>(outcome: Outcome): Readonly<Outcome> {
  if (Object.isFrozen(outcome)) return outcome;
  const owned: Outcome = { ...outcome };
  return Object.freeze(owned);
}

export function publishedSnapshot(state: WorkflowState, current: LoadWorkflowSnapshot["current"] = null): LoadWorkflowSnapshot {
  return Object.freeze({
    state: Object.freeze({
      ...state,
      lastOutcome: state.lastOutcome === null ? null : ownOutcome(state.lastOutcome),
    }),
    current,
  });
}
