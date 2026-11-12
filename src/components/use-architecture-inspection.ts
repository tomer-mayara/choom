import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Baseline } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import type { ArchitectureLayout } from "../lib/architecture-layout.ts";
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

/** One inspection path belongs to one published baseline/layout pair. */
export function useArchitectureInspection(baseline: ReadonlyData<Baseline>, layout: ReadonlyData<ArchitectureLayout>) {
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
    const focusHeading = keyboard || Boolean(container.current?.contains(document.activeElement));
    setState({ baseline, layout, frames: [frame(panel)], opener, focusHeading, returning: false });
  }, [baseline, layout]);

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
    const restore = container.current?.contains(document.activeElement);
    setState(null);
    if (restore) {
      const target = current?.opener.checkVisibility({ visibilityProperty: true })
        && !current.opener.closest("[hidden], [inert], [aria-hidden='true']")
        ? current.opener : document.getElementById("baseline-details-control");
      target?.focus({ preventScroll: true });
    }
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
