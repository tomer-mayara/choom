import type { ReadonlyData } from "../domain/readonly-data.ts";
import type { ArchitectureLayout } from "./architecture-layout.ts";
import { componentControlHeight } from "./component-geometry.ts";

type Point = { x: number; y: number };
type Geometry = ReadonlyData<ArchitectureLayout>;

export interface ComponentDrag {
  moveTo(position: Point): void;
  finish(): void;
}

function moveComponent(geometry: Geometry, id: string, requested: Point): Geometry {
  if (!Number.isFinite(requested.x) || !Number.isFinite(requested.y)) throw new Error("Component coordinates must be finite.");
  const nodes = new Map(geometry.nodes.map((node) => [node.id, node]));
  const node = nodes.get(id);
  if (!node) throw new Error(`Unknown component: ${id}`);
  const position = node.parentId
    ? { x: Math.max(0, requested.x), y: Math.max(componentControlHeight, requested.y) } : { ...requested };
  if (position.x === node.position.x && position.y === node.position.y) return geometry;
  let moved = { ...node, position };
  nodes.set(id, moved);
  while (moved.parentId) {
    const parent = nodes.get(moved.parentId);
    if (!parent) throw new Error("The component has no parent geometry.");
    const width = Math.max(parent.width, moved.position.x + moved.width);
    const height = Math.max(parent.height, moved.position.y + moved.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error("Component bounds must be finite.");
    if (width === parent.width && height === parent.height) break;
    moved = { ...parent, position: { ...parent.position }, width, height };
    nodes.set(parent.id, moved);
  }
  return { nodes: geometry.nodes.map((node) => nodes.get(node.id) ?? node) };
}

/** One open view owns these positions. Recorded data and prepared layout stay unchanged. */
export class ComponentArrangement {
  private readonly initial: Geometry;
  private geometry: Geometry;
  private readonly listeners = new Set<() => void>();
  private drag: { token: ComponentDrag; before: Geometry } | null = null;

  constructor(layout: Geometry) {
    this.initial = { nodes: layout.nodes.map((node) => ({ ...node, position: { ...node.position } })) };
    this.geometry = this.initial;
  }

  getSnapshot = (): Geometry => this.geometry;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  positionOf(id: string): Point {
    const nodes = new Map(this.geometry.nodes.map((node) => [node.id, node]));
    let node = nodes.get(id);
    if (!node) throw new Error(`Unknown component: ${id}`);
    const position = { ...node.position };
    while (node.parentId) {
      node = nodes.get(node.parentId);
      if (!node) throw new Error("The component has no parent geometry.");
      position.x += node.position.x;
      position.y += node.position.y;
    }
    return position;
  }

  moveBy(id: string, delta: Point): void {
    this.cancelDrag();
    const node = this.geometry.nodes.find((node) => node.id === id);
    if (!node) throw new Error(`Unknown component: ${id}`);
    this.publish(moveComponent(this.geometry, id, { x: node.position.x + delta.x, y: node.position.y + delta.y }));
  }

  beginDrag(id: string): ComponentDrag {
    this.cancelDrag();
    if (!this.geometry.nodes.some((node) => node.id === id)) throw new Error(`Unknown component: ${id}`);
    const token: ComponentDrag = {
      moveTo: (position) => {
        if (this.drag?.token === token) this.publish(moveComponent(this.geometry, id, position));
      },
      finish: () => { if (this.drag?.token === token) this.drag = null; },
    };
    this.drag = { token, before: this.geometry };
    return token;
  }

  cancelDrag(): void {
    if (!this.drag) return;
    const { before } = this.drag;
    this.drag = null;
    this.publish(before);
  }

  reset(): void {
    this.drag = null;
    this.publish(this.initial);
  }

  private publish(geometry: Geometry): void {
    if (geometry === this.geometry) return;
    this.geometry = geometry;
    for (const listener of this.listeners) listener();
  }
}
