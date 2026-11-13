import type { InterfaceArc } from "./interface-arcs.ts";

export type ConnectionMode = "selected" | "all";

export function shownInterfaceArcs<T extends InterfaceArc>(arcs: readonly T[], scope: {
  mode: ConnectionMode;
  componentId?: string;
  interfaceId?: string;
  showSelfConnections?: boolean;
}): readonly T[] {
  const scoped = scope.mode === "all" ? arcs
    : scope.componentId ? arcs.filter(({ consumerId, ownerId }) => consumerId === scope.componentId || ownerId === scope.componentId)
    : scope.interfaceId ? arcs.filter(({ interfaceId }) => interfaceId === scope.interfaceId) : [];
  return scope.showSelfConnections ? scoped : scoped.filter(({ consumerId, ownerId }) => consumerId !== ownerId);
}
