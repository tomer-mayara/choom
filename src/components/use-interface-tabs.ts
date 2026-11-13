import { useCallback, useRef, useState, type RefObject } from "react";

export function revealInterfaceFocus(content: HTMLDivElement) {
  const active = content.ownerDocument.activeElement;
  if (!(active instanceof HTMLElement) || !content.contains(active)) return;
  const area = content.getBoundingClientRect();
  const control = active.getBoundingClientRect();
  const tabs = content.querySelector('[role="tablist"]');
  const inset = content.clientTop + (Number.parseFloat(getComputedStyle(content).paddingTop) || 0);
  const top = area.top + inset + (tabs?.contains(active) ? 0 : tabs?.getBoundingClientRect().height ?? 0);
  // A short panel must not restore or reset past the control that still has focus.
  if (control.top < top || control.bottom > area.bottom) content.scrollTop += control.top - top;
}

/** Each tab has one reading position for this mounted inspection frame. */
export function useInterfaceTabs(content?: RefObject<HTMLDivElement | null>) {
  const [tab, setTab] = useState("overview");
  const [reset, setReset] = useState(0);
  const activeTab = useRef("overview");
  const positions = useRef<Record<string, number>>({});
  function changeTab(next: string) {
    // Focus and mouse-down can request the same tab before both handlers return.
    if (next === activeTab.current) return;
    if (content?.current) positions.current[activeTab.current] = content.current.scrollTop;
    activeTab.current = next;
    setTab(next);
  }
  function resetExample() {
    positions.current.example = 0;
    if (tab === "example") setReset((previous) => previous + 1);
  }
  const restore = useCallback(() => {
    if (!content?.current) return;
    content.current.scrollTop = positions.current[tab] ?? 0;
    revealInterfaceFocus(content.current);
  }, [content, tab, reset]);
  return { tab, changeTab, resetExample, restore };
}
