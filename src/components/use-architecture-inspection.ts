import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Baseline } from "@choom/baseline-model/contracts";
import type { ReadonlyData } from "@choom/baseline-model/readonly-data";
import type { ArchitectureLayout } from "../lib/architecture-layout.ts";
import type { ConnectionMode } from "../lib/interface-arc-visibility.ts";
import type { ArchitecturePanel } from "./architecture-details.tsx";
import { interfaceReadingState, type InterfaceReadingState } from "./interface-reading-state.ts";

interface InspectionFrame {
  key: number;
  panel: ArchitecturePanel;
  scrollTop: number;
  sections: string[];
  returnId?: string;
  componentId?: string;
  connectionPanel?: Extract<ArchitecturePanel, { kind: "component" | "interface" }>;
  reading?: InterfaceReadingState;
  listState: { showDistinctions: boolean };
}

interface InspectionState {
  source: ReadonlyData<Baseline>;
  raw: boolean;
  baseline: ReadonlyData<Baseline>;
  layout: ReadonlyData<ArchitectureLayout>;
  frames: InspectionFrame[];
  opener: HTMLElement;
  focusHeading: boolean;
  returning: boolean;
  reportSession: number | null;
  focusReportAction?: boolean;
}

function frame(panel: ArchitecturePanel, key: number, previous?: InspectionFrame): InspectionFrame {
  const next: InspectionFrame = { key, panel, scrollTop: 0, sections: [], listState: { showDistinctions: false } };
  if (panel.kind === "component") { next.componentId = panel.componentId; next.connectionPanel = panel; }
  if (panel.kind === "interface") {
    next.componentId = previous?.panel.kind === "duplicate" ? undefined : previous?.componentId;
    next.connectionPanel = panel;
    next.reading = interfaceReadingState(panel.entryId);
  }
  if (panel.kind === "operation") {
    next.componentId = previous?.componentId;
    next.connectionPanel = { kind: "interface", interfaceId: panel.operationId };
  }
  if (panel.kind === "duplicates" || panel.kind === "duplicate") {
    next.componentId = previous?.componentId;
    next.connectionPanel = previous?.connectionPanel;
  }
  if (panel.kind === "resource") next.componentId = previous?.componentId;
  return next;
}

function visibleControl(control: HTMLElement | null | undefined): control is HTMLElement {
  return Boolean(control?.isConnected && control.checkVisibility({ visibilityProperty: true })
    && !control.closest("[hidden], [inert], [aria-hidden='true']"));
}

function ownerHeader(opener: HTMLElement, baseline: ReadonlyData<Baseline>): HTMLElement | undefined {
  let id = opener.dataset.ownerId;
  while (id) {
    const header = [...document.querySelectorAll<HTMLElement>("[data-component-id]")].find((control) => control.dataset.componentId === id);
    if (visibleControl(header)) return header;
    id = baseline.components.find((component) => component.id === id)?.parent?.value ?? undefined;
  }
}

function restoredArcControl(opener: HTMLElement, container: HTMLElement | null): HTMLElement | undefined {
  const view = container?.closest("section");
  const { interfaceId, consumerId, ownerId } = opener.dataset;
  return Array.from(view?.querySelectorAll<HTMLElement>("[data-interface-label]") ?? []).find((control) =>
    control.dataset.interfaceId === interfaceId && control.dataset.consumerId === consumerId
    && control.dataset.ownerId === ownerId && visibleControl(control));
}

function restoreInspectionFocus(current: InspectionState | null, container: HTMLElement | null, mode: ConnectionMode) {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const fromPanel = Boolean(container?.contains(active));
  const opener = fromPanel ? current?.opener : active;
  const arc = opener?.hasAttribute("data-interface-label");
  const survives = visibleControl(opener) && (!arc || mode === "all");
  if (!fromPanel && (!arc || survives)) return;
  const restored = arc && opener && !opener.isConnected && mode === "all" ? restoredArcControl(opener, container) : undefined;
  const target = survives ? opener : restored ?? (arc && opener && current ? ownerHeader(opener, current.baseline) : undefined);
  (target ?? document.getElementById("baseline-details-control"))?.focus({ preventScroll: true });
}

function hidesFocusedArc(panel: ArchitecturePanel, mode: ConnectionMode): boolean {
  const active = document.activeElement;
  if (mode === "all" || !(active instanceof HTMLElement) || !active.hasAttribute("data-interface-label")) return false;
  if (panel.kind === "component") return active.dataset.consumerId !== panel.componentId && active.dataset.ownerId !== panel.componentId;
  return panel.kind === "operation" ? active.dataset.interfaceId !== panel.operationId
    : panel.kind !== "interface" || active.dataset.interfaceId !== panel.interfaceId;
}

interface InspectionScope {
  source: ReadonlyData<Baseline>;
  raw: boolean;
  operations?: ReadonlyMap<string, unknown>;
}

function remainsVisible(panel: ArchitecturePanel, baseline: ReadonlyData<Baseline>, scope: InspectionScope): boolean {
  switch (panel.kind) {
    case "component": return baseline.components.some(({ id }) => id === panel.componentId);
    case "interface": return baseline.interfaces.some(({ id }) => id === panel.interfaceId);
    case "resource": return baseline.resources.some(({ id }) => id === panel.resourceId);
    case "operation": return scope.operations?.has(panel.operationId) ?? false;
    case "duplicate": case "duplicates": case "discovery": return scope.raw;
    default: return true;
  }
}

function reconcileInspection(state: InspectionState | null, options: {
  baseline: ReadonlyData<Baseline>; layout: ReadonlyData<ArchitectureLayout>; source: ReadonlyData<Baseline>;
  raw: boolean; scope?: InspectionScope; reportSession: number | null;
}, nextFrameKey: { current: number }): InspectionState | null {
  const { baseline, layout, source, raw, scope, reportSession } = options;
  if (state && scope && state.source === source && state.raw !== raw) {
    const visible = new Set(baseline.components.map(({ id }) => id));
    const frames = state.frames.filter(({ panel }) => remainsVisible(panel, baseline, scope)).map((entry) =>
      entry.componentId && !visible.has(entry.componentId) ? { ...entry, componentId: undefined, returnId: undefined } : entry);
    return frames.length ? { ...state, source, raw, baseline, layout, frames, reportSession,
      returning: false, focusHeading: false, focusReportAction: false } : null;
  } else if (state && (state.baseline !== baseline || state.layout !== layout || state.source !== source)) return null;
  else if (state && state.reportSession !== reportSession) {
    const reportPath = state.frames.some(({ panel }) => panel.kind === "duplicates" || panel.kind === "duplicate");
    return { ...state, reportSession,
      ...(reportPath ? { frames: [frame({ kind: "duplicates" }, ++nextFrameKey.current)],
        focusHeading: true, focusReportAction: reportSession === null, returning: false } : {}),
    };
  }
  return state;
}

/** One inspection path belongs to one published baseline/layout pair. */
export function useArchitectureInspection(baseline: ReadonlyData<Baseline>, layout: ReadonlyData<ArchitectureLayout>, connectionMode: ConnectionMode = "selected", reportSession: number | null = null, scope?: InspectionScope) {
  const [state, setState] = useState<InspectionState | null>(null);
  const nextFrameKey = useRef(0);
  const container = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const source = scope?.source ?? baseline;
  const raw = scope?.raw ?? true;
  const reconciled = reconcileInspection(state, { baseline, layout, source, raw, scope, reportSession }, nextFrameKey);
  if (state !== reconciled) setState(reconciled);
  const current = state?.baseline === baseline && state.layout === layout ? state : null;
  const entry = current?.frames.at(-1);
  const panel = entry?.panel ?? null;

  const open = useCallback((panel: ArchitecturePanel, opener: HTMLElement, keyboard: boolean) => {
    const focusHeading = keyboard || Boolean(container.current?.contains(document.activeElement)) || hidesFocusedArc(panel, connectionMode);
    setState({ baseline, layout, source, raw, frames: [frame(panel, ++nextFrameKey.current)], opener, focusHeading, returning: false, reportSession });
  }, [baseline, layout, connectionMode, reportSession, source, raw]);

  function navigate(panel: ArchitecturePanel, trigger: HTMLElement) {
    if (!current || !entry) return;
    const saved = {
      ...entry, scrollTop: content.current?.scrollTop ?? 0, returnId: trigger.dataset.recordId,
      sections: Array.from(content.current?.querySelectorAll<HTMLDetailsElement>("details[open][data-section]") ?? [],
        (section) => section.dataset.section ?? ""),
    };
    setState({ ...current, frames: [...current.frames.slice(0, -1), saved, frame(panel, ++nextFrameKey.current, entry)], focusHeading: true, returning: false, focusReportAction: false });
  }

  function back() {
    if (!current || current.frames.length < 2) return;
    setState({ ...current, frames: current.frames.slice(0, -1), focusHeading: true, returning: true });
  }

  function close() {
    setState(null);
    restoreInspectionFocus(current, container.current, connectionMode);
  }

  useInspectionFocus(current, { container, content, heading }, close);

  return {
    panel, open, navigate, back, close, container, content, heading, frameKey: entry?.key,
    sections: entry?.sections ?? [], canGoBack: (current?.frames.length ?? 0) > 1,
    componentId: entry?.componentId, connectionPanel: entry?.connectionPanel,
    reading: entry?.reading, listState: entry?.listState,
  };
}

function useInspectionFocus(current: InspectionState | null, refs: {
  container: ReturnType<typeof useRef<HTMLElement | null>>;
  content: ReturnType<typeof useRef<HTMLDivElement | null>>;
  heading: ReturnType<typeof useRef<HTMLHeadingElement | null>>;
}, close: () => void) {
  const { container, content, heading } = refs;
  const entry = current?.frames.at(-1);
  const panel = entry?.panel;
  const returning = current?.returning;
  const focusHeading = current?.focusHeading;
  const focusReportAction = current?.focusReportAction;
  useLayoutEffect(() => {
    if (!entry) return;
    if (returning && entry.returnId) {
      const row = Array.from(content.current?.querySelectorAll<HTMLElement>("[data-record-id]") ?? [])
        .find((element) => element.dataset.recordId === entry.returnId);
      (row ?? heading.current)?.focus({ preventScroll: true });
      if (content.current) content.current.scrollTop = entry.scrollTop;
    } else {
      if (content.current) content.current.scrollTop = 0;
      if (focusReportAction) (document.getElementById("open-duplication-report") ?? heading.current)?.focus({ preventScroll: true });
      else if (focusHeading) heading.current?.focus({ preventScroll: true });
    }
  }, [entry, returning, focusHeading, focusReportAction]);

  useEffect(() => {
    if (!panel) return;
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      const row = event.target instanceof Element ? event.target.closest("details[open]") : null;
      if (panel?.kind === "rules" && row instanceof HTMLDetailsElement && container.current?.contains(row)) {
        row.open = false;
        row.querySelector("summary")?.focus();
      } else close();
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  });

}

export type ArchitectureInspection = ReturnType<typeof useArchitectureInspection>;
