import { BaseEdge, EdgeLabelRenderer, useReactFlow, useStoreApi, type Edge, type EdgeProps } from "@xyflow/react";
import { useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { interfaceArcHighlightedStroke, type InterfaceArcRoute } from "../lib/interface-arc-geometry.ts";
import { componentControlWidth } from "../lib/component-geometry.ts";
import type { ComponentArrangement } from "../lib/component-arrangement.ts";
import type { ArchitectureInspection } from "./use-architecture-inspection.ts";
import { revealBounds } from "../lib/architecture-viewport.ts";

export type InterfaceEdge = Edge<{
  route: InterfaceArcRoute; name: string; accessibleName: string;
  inspect: ArchitectureInspection["open"]; view: ComponentArrangement;
  pressGeneration: RefObject<number>;
  emphasis: "normal" | "highlighted" | "dimmed";
  labelOrder: number;
  inspected: boolean;
}, "interface">;

export function InterfaceArc({ id, data, markerEnd }: EdgeProps<InterfaceEdge>) {
  const label = useRef<HTMLButtonElement | null>(null);
  const curve = useRef<SVGGElement | null>(null);
  const pressed = useRef<{ view: ComponentArrangement; generation: number } | null>(null);
  const pointerSelection = useRef(false);
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const { getViewport, setViewport } = useReactFlow();
  const store = useStoreApi();
  const labelOrder = data?.labelOrder;
  useLayoutEffect(() => {
    const control = label.current;
    const container = control?.parentElement;
    if (!control || !container || labelOrder === undefined) return;
    const before = control.previousElementSibling;
    const after = control.nextElementSibling;
    const beforeOrder = before instanceof HTMLElement ? Number(before.dataset.interfaceOrder) : -Infinity;
    const afterOrder = after instanceof HTMLElement ? Number(after.dataset.interfaceOrder) : Infinity;
    if (beforeOrder <= labelOrder && labelOrder <= afterOrder) return;
    // React Flow portals retain insertion order. Move the existing control, not its focus or press state.
    const next = [...container.children].find((element) => element instanceof HTMLElement
      && element !== control && Number(element.dataset.interfaceOrder) > labelOrder);
    container.insertBefore(control, next ?? null);
  }, [labelOrder]);
  if (!data) return null;
  const { route, name, accessibleName, inspect, view, pressGeneration, emphasis } = data;
  const labelVisible = hovered || keyboardFocused || data.inspected;
  const identity = { "data-interface-id": route.interfaceId, "data-consumer-id": route.consumerId, "data-owner-id": route.ownerId };

  function revealLabel(control: HTMLButtonElement) {
    const viewport = getViewport();
    const labelBounds = control.getBoundingClientRect();
    const { domNode, width, height } = store.getState();
    const canvas = domNode?.getBoundingClientRect();
    const labelWidth = labelBounds.width / viewport.zoom;
    const labelHeight = labelBounds.height / viewport.zoom;
    if (labelWidth <= 0 || labelHeight <= 0 || width <= 0 || height <= 0) return;
    // The 2px outline and 2px offset scale with the label.
    const focusPadding = 4 * viewport.zoom;
    const next = revealBounds(viewport, {
      x: route.label.x - labelWidth / 2, y: route.label.y - labelHeight / 2, width: labelWidth, height: labelHeight,
    }, canvas?.width || width, canvas?.height || height, focusPadding);
    if (next.x !== viewport.x || next.y !== viewport.y) void setViewport(next);
  }

  function revealFocusedLabel(event: FocusEvent<HTMLButtonElement>) {
    if (pointerSelection.current || !event.currentTarget.matches(":focus-visible")) return;
    setKeyboardFocused(true);
    revealLabel(event.currentTarget);
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (["Shift", "Control", "Meta", "Alt"].includes(event.key)) return;
    setKeyboardFocused(true);
    // Tab reveals the destination control through its focus event.
    if (event.key !== "Tab") revealLabel(event.currentTarget);
  }

  function focusPointerLabel() {
    setKeyboardFocused(false);
    pointerSelection.current = true;
    label.current?.focus({ preventScroll: true });
    pointerSelection.current = false;
  }

  function begin(event: PointerEvent) {
    if (event.button !== 0 || event.isPrimary === false) return;
    event.stopPropagation();
    pressed.current = { view, generation: pressGeneration.current };
    focusPointerLabel();
  }

  function activate(event: MouseEvent) {
    event.stopPropagation();
    const keyboard = event.detail === 0;
    if (!label.current || (!keyboard && (pressed.current?.view !== view || pressed.current.generation !== pressGeneration.current))) return;
    pressed.current = null;
    if (!keyboard) focusPointerLabel();
    inspect({ kind: "interface", interfaceId: route.interfaceId }, label.current, keyboard);
  }

  function enter(event: PointerEvent) {
    if (event.pointerType !== "touch") setHovered(true);
  }

  function leave(event: PointerEvent) {
    const next = event.relatedTarget;
    if (next instanceof Node && (label.current?.contains(next) || curve.current?.contains(next))) return;
    setHovered(false);
  }

  const cancel = () => { pressed.current = null; setHovered(false); };
  return <>
    <g ref={curve} className="nopan cursor-pointer" style={{ pointerEvents: "visibleStroke" }} onPointerEnter={enter} onPointerLeave={leave}
      onPointerDown={begin} onPointerCancel={cancel} onClick={activate}>
      <BaseEdge id={id} path={route.path} markerEnd={markerEnd}
        style={{ stroke: "var(--foreground)", strokeWidth: emphasis === "highlighted" ? interfaceArcHighlightedStroke : 1.5, opacity: emphasis === "dimmed" ? 0.35 : 1 }}
        data-interface-arc="" {...identity} />
    </g>
    <EdgeLabelRenderer>
      <button ref={label} type="button" data-interface-label="" {...identity} aria-label={accessibleName}
        data-interface-order={labelOrder} data-label-visible={labelVisible}
        aria-haspopup="dialog"
        className="nodrag nopan absolute cursor-pointer rounded px-2 py-1 text-center text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        style={{ width: "max-content", maxWidth: componentControlWidth, opacity: labelVisible ? 1 : 0,
          backgroundColor: "transparent", textShadow: "0 0 2px var(--card)", pointerEvents: labelVisible ? "auto" : "none",
          transform: `translate(-50%, -50%) translate(${route.label.x}px, ${route.label.y}px)` }}
        onFocus={revealFocusedLabel} onBlur={() => setKeyboardFocused(false)} onKeyDown={keyDown}
        onPointerEnter={enter} onPointerLeave={leave}
        onPointerDown={begin} onPointerCancel={cancel} onClick={activate}>
        <span className="line-clamp-2 leading-4 wrap-anywhere">{name}</span>
      </button>
    </EdgeLabelRenderer>
  </>;
}
