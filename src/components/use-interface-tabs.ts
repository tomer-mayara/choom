import { useLayoutEffect, useRef, useState, type RefObject } from "react";

function restorePosition(content: HTMLDivElement, position: number) {
  content.scrollTop = position;
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
  const positions = useRef<Record<string, number>>({});
  function changeTab(next: string) {
    if (next === tab) return;
    if (content?.current) positions.current[tab] = content.current.scrollTop;
    setTab(next);
  }
  function resetExample() {
    positions.current.example = 0;
    if (tab === "example") setReset((previous) => previous + 1);
  }
  useLayoutEffect(() => {
    if (content?.current) restorePosition(content.current, positions.current[tab] ?? 0);
  }, [content, tab, reset]);
  return { tab, changeTab, resetExample };
}
