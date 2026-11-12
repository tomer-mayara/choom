import { useCallback, useLayoutEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { ComponentArrangement } from "../lib/component-arrangement.ts";

type Point = { x: number; y: number };
interface PointerCycle { owner: ComponentArrangement; blocked: boolean }

function listenForDrag(element: HTMLButtonElement, pointerId: number, handlers: {
  move: (event: PointerEvent) => void; finish: () => void; cancel: () => void;
}): () => void {
  const release = (event: PointerEvent) => { if (event.pointerId === pointerId) handlers.finish(); };
  const interrupted = (event: PointerEvent) => { if (event.pointerId === pointerId) handlers.cancel(); };
  const escape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    handlers.cancel();
  };
  window.addEventListener("pointermove", handlers.move, { passive: false });
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", interrupted);
  window.addEventListener("blur", handlers.cancel);
  window.addEventListener("keydown", escape, true);
  element.addEventListener("lostpointercapture", interrupted);
  element.setPointerCapture?.(pointerId);
  return () => {
    window.removeEventListener("pointermove", handlers.move);
    window.removeEventListener("pointerup", release);
    window.removeEventListener("pointercancel", interrupted);
    window.removeEventListener("blur", handlers.cancel);
    window.removeEventListener("keydown", escape, true);
    element.removeEventListener("lostpointercapture", interrupted);
    if (element.hasPointerCapture?.(pointerId)) element.releasePointerCapture(pointerId);
  };
}

function startComponentDrag(
  event: ReactPointerEvent<HTMLButtonElement>, id: string, cycle: PointerCycle,
  toDiagram: (point: Point) => Point, onEnd: () => void,
): () => void {
  const arrangement = cycle.owner;
  const origin = arrangement.getSnapshot().nodes.find((node) => node.id === id)?.position;
  if (!origin) throw new Error(`Unknown component: ${id}`);
  const pointerId = event.pointerId;
  const pressed = { x: event.clientX, y: event.clientY };
  const start = toDiagram(pressed);
  const drag = arrangement.beginDrag(id);
  let finished = false;
  const end = (cancelled: boolean) => {
    if (finished) return;
    finished = true;
    onEnd();
    if (cancelled) {
      cycle.blocked = true;
      arrangement.cancelDrag();
    } else drag.finish();
    cleanup();
  };
  const cleanup = listenForDrag(event.currentTarget, pointerId, {
    move: (pointer) => {
      if (pointer.pointerId !== pointerId || finished) return;
      if (pointer.pointerType === "mouse" && pointer.buttons === 0) { end(true); return; }
      if (!cycle.blocked && Math.hypot(pointer.clientX - pressed.x, pointer.clientY - pressed.y) < 3) return;
      cycle.blocked = true;
      pointer.preventDefault();
      const position = toDiagram({ x: pointer.clientX, y: pointer.clientY });
      drag.moveTo({ x: origin.x + position.x - start.x, y: origin.y + position.y - start.y });
    },
    finish: () => end(false), cancel: () => end(true),
  });
  return () => end(true);
}

/** A pointer cycle stays with its originating view, even if React reuses the header DOM. */
export function useComponentGestures(arrangement: ComponentArrangement) {
  const cycle = useRef<PointerCycle | null>(null);
  const active = useRef<{ owner: ComponentArrangement; cancel: () => void } | null>(null);
  const cancel = useCallback(() => { active.current?.cancel(); }, []);
  useLayoutEffect(() => () => {
    if (active.current?.owner === arrangement) active.current.cancel();
    if (cycle.current?.owner === arrangement) cycle.current.blocked = true;
  }, [arrangement]);

  const begin = useCallback((event: ReactPointerEvent<HTMLButtonElement>, id: string, toDiagram: (point: Point) => Point) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    event.stopPropagation();
    cancel();
    const current = { owner: arrangement, blocked: false };
    cycle.current = current;
    active.current = { owner: arrangement,
      cancel: startComponentDrag(event, id, current, toDiagram, () => { active.current = null; }) };
  }, [arrangement, cancel]);

  return useMemo(() => ({
    begin, cancel,
    allowsClick: () => cycle.current?.owner === arrangement && !cycle.current.blocked,
    moveBy: (id: string, delta: Point) => {
      cancel();
      arrangement.moveBy(id, delta);
      return arrangement.positionOf(id);
    },
  }), [arrangement, begin, cancel]);
}

export type ComponentGestures = ReturnType<typeof useComponentGestures>;
