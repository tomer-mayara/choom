import type { Baseline, DuplicationReport } from "../domain/generated/contracts.ts";
import type { ArchitectureLayout } from "../lib/architecture-layout.ts";
import type { WorkflowOutcome, WorkflowState } from "./generated/workflow.ts";
import type { LoadWorkflowSnapshot } from "./workspace-view.ts";

/** Copy the validated baseline and prepared positions once, before the view commit. */
export function ownCurrentView(baseline: Baseline, layout: ArchitectureLayout, sha256: string): NonNullable<LoadWorkflowSnapshot["current"]> {
  const current = structuredClone({ baseline, layout, sha256 });
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

export function ownDuplication(report: DuplicationReport, session: number): NonNullable<LoadWorkflowSnapshot["duplication"]> {
  const attachment = structuredClone({ report, session });
  function freeze(value: unknown): void {
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
  }
  freeze(attachment);
  return attachment;
}

export function publishedSnapshot(state: WorkflowState, current: LoadWorkflowSnapshot["current"] = null,
  duplication: LoadWorkflowSnapshot["duplication"] = null): LoadWorkflowSnapshot {
  return Object.freeze({
    state: Object.freeze({
      ...state,
      lastOutcome: state.lastOutcome === null ? null : ownOutcome(state.lastOutcome),
    }),
    current,
    duplication,
  });
}
