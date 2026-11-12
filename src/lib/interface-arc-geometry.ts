import type { ReadonlyData } from "../domain/readonly-data.ts";
import type { ArchitectureLayout } from "./architecture-layout.ts";
import { componentControlHeight, componentControlWidth, componentGroupBorderWidth } from "./component-geometry.ts";
import { componentPositions } from "./component-positions.ts";
import type { InterfaceArc } from "./interface-arcs.ts";

type Point = { x: number; y: number };
export const interfaceArcHighlightedStroke = 3;
export interface InterfaceArcRoute extends InterfaceArc {
  start: Point;
  end: Point;
  controls: [Point, Point];
  label: Point;
  path: string;
}

function curvedRoute(arc: InterfaceArc, start: Point, end: Point, controls: [Point, Point]): InterfaceArcRoute {
  const label = { x: (start.x + end.x) / 8 + (controls[0].x + controls[1].x) * 0.375,
    y: (start.y + end.y) / 8 + (controls[0].y + controls[1].y) * 0.375 };
  return { ...arc, start, end, controls, label,
    path: `M ${start.x} ${start.y} C ${controls[0].x} ${controls[0].y} ${controls[1].x} ${controls[1].y} ${end.x} ${end.y}` };
}

function betweenHeaders(arc: InterfaceArc, consumer: Point, owner: Point, lane: number, drawingCenter: Point): InterfaceArcRoute {
  const horizontal = Math.abs(owner.x - consumer.x) >= Math.abs(owner.y - consumer.y);
  const direction = horizontal
    ? ((consumer.y + owner.y) / 2 < drawingCenter.y ? -1 : 1)
    : ((consumer.x + owner.x) / 2 < drawingCenter.x ? -1 : 1);
  if (horizontal) {
    const border = direction > 0 ? componentControlHeight : 0;
    const start = { x: consumer.x + componentControlWidth / 2, y: consumer.y + border };
    const end = { x: owner.x + componentControlWidth / 2, y: owner.y + border };
    const extreme = direction > 0 ? Math.max(start.y, end.y) : Math.min(start.y, end.y);
    const outside = extreme + direction * (80 + lane * 80 + Math.abs(start.y - end.y) / 6);
    return curvedRoute(arc, start, end, [{ x: start.x, y: outside }, { x: end.x, y: outside }]);
  }
  const border = direction > 0 ? componentControlWidth : 0;
  const start = { x: consumer.x + border, y: consumer.y + componentControlHeight / 2 };
  const end = { x: owner.x + border, y: owner.y + componentControlHeight / 2 };
  const extreme = direction > 0 ? Math.max(start.x, end.x) : Math.min(start.x, end.x);
  const outside = extreme + direction * (180 + lane * 360 + Math.abs(start.x - end.x) / 6);
  return curvedRoute(arc, start, end, [{ x: outside, y: start.y }, { x: outside, y: end.y }]);
}

function aroundHeader(arc: InterfaceArc, header: Point, lane: number, drawingCenter: Point): InterfaceArcRoute {
  const direction = header.x < drawingCenter.x ? -1 : 1;
  const x = header.x + (direction > 0 ? componentControlWidth : 0);
  const outside = x + direction * (240 + lane * 360);
  const start = { x, y: header.y + componentControlHeight / 4 };
  const end = { x, y: header.y + componentControlHeight * 0.75 };
  return curvedRoute(arc, start, end, [{ x: outside, y: start.y - 32 }, { x: outside, y: end.y + 32 }]);
}

export function routeInterfaceArcs(arcs: readonly InterfaceArc[], geometry: ReadonlyData<ArchitectureLayout>): InterfaceArcRoute[] {
  if (arcs.length === 0) return [];
  const positions = componentPositions(geometry);
  const groups = new Set(geometry.nodes.flatMap(({ parentId }) => parentId ? [parentId] : []));
  for (const id of groups) {
    const position = positions.get(id);
    if (position) positions.set(id, { x: position.x + componentGroupBorderWidth, y: position.y + componentGroupBorderWidth });
  }
  const points = [...positions.values()];
  const drawingCenter = { x: (Math.min(...points.map(({ x }) => x)) + Math.max(...points.map(({ x }) => x))) / 2,
    y: (Math.min(...points.map(({ y }) => y)) + Math.max(...points.map(({ y }) => y))) / 2 };
  const lanes = new Map<string, number>();
  return arcs.map((arc) => {
    const consumer = positions.get(arc.consumerId);
    const owner = positions.get(arc.ownerId);
    if (!consumer || !owner) throw new Error("The interface arc has no component geometry.");
    const pair = JSON.stringify([arc.consumerId, arc.ownerId].sort());
    const lane = lanes.get(pair) ?? 0;
    lanes.set(pair, lane + 1);
    return arc.consumerId === arc.ownerId ? aroundHeader(arc, owner, lane, drawingCenter) : betweenHeaders(arc, consumer, owner, lane, drawingCenter);
  });
}
