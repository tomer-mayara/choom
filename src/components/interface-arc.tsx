import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from "@xyflow/react";
import type { InterfaceArcRoute } from "../lib/interface-arc-geometry.ts";
import { componentControlWidth } from "../lib/component-geometry.ts";

export type InterfaceEdge = Edge<{
  route: InterfaceArcRoute; name: string; accessibleName: string;
}, "interface">;

export function InterfaceArc({ id, data, markerEnd }: EdgeProps<InterfaceEdge>) {
  if (!data) return null;
  const { route, name, accessibleName } = data;
  const identity = { "data-interface-id": route.interfaceId, "data-consumer-id": route.consumerId, "data-owner-id": route.ownerId };
  return <>
    <BaseEdge id={id} path={route.path} markerEnd={markerEnd}
      style={{ stroke: "var(--foreground)", strokeWidth: 1.5 }} data-interface-arc="" {...identity} />
    <EdgeLabelRenderer>
      <span role="img" data-interface-label="" {...identity} aria-label={accessibleName} title={name}
        className="pointer-events-none absolute rounded bg-card px-2 py-1 text-center text-xs text-foreground"
        style={{ width: "max-content", maxWidth: componentControlWidth, transform: `translate(-50%, -50%) translate(${route.label.x}px, ${route.label.y}px)` }}>
        <span className="line-clamp-2 leading-4 wrap-anywhere">{name}</span>
      </span>
    </EdgeLabelRenderer>
  </>;
}
