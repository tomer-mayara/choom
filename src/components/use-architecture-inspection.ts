import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Baseline } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import type { ArchitectureLayout } from "../lib/architecture-layout.ts";
import type { ConnectionMode } from "../lib/interface-arc-visibility.ts";
import type { ArchitecturePanel } from "./architecture-details.tsx";

interface InspectionFrame {
  panel: ArchitecturePanel;
  scrollTop: number;
  sections: string[];
  returnId?: string;
}

interface InspectionState {
  baseline: ReadonlyData<Baseline>;
  layout: ReadonlyData<ArchitectureLayout>;
  frames: InspectionFrame[];
  opener: HTMLElement;
  focusHeading: boolean;
  returning: boolean;
}

function frame(panel: ArchitecturePanel): InspectionFrame {
  return { panel, scrollTop: 0, sections: [] };
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

function restoreInspectionFocus(current: InspectionState | null, container: HTMLElement | null, mode: ConnectionMode) {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const fromPanel = Boolean(container?.contains(active));
  const opener = fromPanel ? current?.opener : active;
  const arc = opener?.hasAttribute("data-interface-label");
  const survives = visibleControl(opener) && (!arc || mode === "all");
  if (!fromPanel && (!arc || survives)) return;
  const target = survives ? opener : arc && opener && current ? ownerHeader(opener, current.baseline) : undefined;
  (target ?? document.getElementById("baseline-details-control"))?.focus({ preventScroll: true });
}

function hidesFocusedArc(panel: ArchitecturePanel, mode: ConnectionMode): boolean {
  const active = document.activeElement;
  if (mode === "all" || !(active instanceof HTMLElement) || !active.hasAttribute("data-interface-label")) return false;
  if (panel.kind === "component") return active.dataset.consumerId !== panel.componentId && active.dataset.ownerId !== panel.componentId;
  return panel.kind !== "interface" || active.dataset.interfaceId !== panel.interfaceId;
}

/** One inspection path belongs to one published baseline/layout pair. */
export function useArchitectureInspection(baseline: ReadonlyData<Baseline>, layout: ReadonlyData<ArchitectureLayout>, connectionMode: ConnectionMode = "selected") {
  const [state, setState] = useState<InspectionState | null>(null);
  const container = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  if (state && (state.baseline !== baseline || state.layout !== layout)) setState(null);
  const current = state?.baseline === baseline && state.layout === layout ? state : null;
  const entry = current?.frames.at(-1);
  const panel = entry?.panel ?? null;
  const component = current?.frames.findLast(({ panel }) => panel.kind === "component")?.panel;

  const open = useCallback((panel: ArchitecturePanel, opener: HTMLElement, keyboard: boolean) => {
    const focusHeading = keyboard || Boolean(container.current?.contains(document.activeElement)) || hidesFocusedArc(panel, connectionMode);
    setState({ baseline, layout, frames: [frame(panel)], opener, focusHeading, returning: false });
  }, [baseline, layout, connectionMode]);

  function navigate(panel: ArchitecturePanel, trigger: HTMLElement) {
    if (!current || !entry) return;
    const saved = {
      ...entry, scrollTop: content.current?.scrollTop ?? 0, returnId: trigger.dataset.recordId,
      sections: Array.from(content.current?.querySelectorAll<HTMLDetailsElement>("details[open][data-section]") ?? [],
        (section) => section.dataset.section ?? ""),
    };
    setState({ ...current, frames: [...current.frames.slice(0, -1), saved, frame(panel)], focusHeading: true, returning: false });
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
    panel, open, navigate, back, close, container, content, heading,
    sections: entry?.sections ?? [], canGoBack: (current?.frames.length ?? 0) > 1,
    componentId: component?.kind === "component" ? component.componentId : undefined,
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
  useLayoutEffect(() => {
    if (!entry || !current) return;
    if (current.returning && entry.returnId) {
      const row = Array.from(content.current?.querySelectorAll<HTMLElement>("[data-record-id]") ?? [])
        .find((element) => element.dataset.recordId === entry.returnId);
      row?.focus({ preventScroll: true });
      if (content.current) content.current.scrollTop = entry.scrollTop;
    } else {
      if (content.current) content.current.scrollTop = 0;
      if (current.focusHeading) heading.current?.focus({ preventScroll: true });
    }
  }, [entry, current]);

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
