/** Runs inside the browser. Observe painted geometry, not the Fit implementation. */
export function observeInterfaceView() {
  const flow = document.querySelector(".react-flow");
  const viewport = flow?.querySelector(".react-flow__viewport");
  if (!flow || !viewport) throw new Error("The interface view needs a visible canvas.");
  const transform = new DOMMatrixReadOnly(getComputedStyle(viewport).transform);
  const rectangle = (box: DOMRect | DOMRectReadOnly) => ({ x: box.x, y: box.y, width: box.width, height: box.height });
  const shapes: Array<{ kind: string; id: string; bounds: ReturnType<typeof rectangle> }> = [];
  const nodes = [...flow.querySelectorAll<HTMLElement>(".react-flow__node")].map((element) => {
    const position = new DOMMatrixReadOnly(element.style.transform);
    shapes.push({ kind: "component", id: element.dataset.id ?? "", bounds: rectangle(element.getBoundingClientRect()) });
    return { id: element.dataset.id, x: position.e, y: position.f, width: element.offsetWidth, height: element.offsetHeight };
  });
  const paths = [...flow.querySelectorAll<SVGPathElement>("path[data-interface-arc]")].map((path) => {
    const id = JSON.stringify([path.dataset.interfaceId, path.dataset.consumerId, path.dataset.ownerId]);
    const stroke = Number.parseFloat(getComputedStyle(path).strokeWidth);
    const box = path.getBoundingClientRect();
    const margin = stroke * transform.a / 2;
    shapes.push({ kind: "curve", id, bounds: { x: box.x - margin, y: box.y - margin, width: box.width + 2 * margin, height: box.height + 2 * margin } });
    const markerId = path.getAttribute("marker-end")?.match(/^url\(\s*(['"]?)#(.+?)\1\s*\)$/)?.[2];
    const marker = markerId ? document.getElementById(markerId) : null;
    const symbol = marker?.querySelector<SVGGraphicsElement>("polyline");
    const screen = path.getScreenCTM();
    if (!(marker instanceof SVGMarkerElement) || !symbol || !screen) throw new Error("The visible arc needs its arrow marker.");
    const tip = path.getPointAtLength(path.getTotalLength());
    const tangent = path.getPointAtLength(Math.max(0, path.getTotalLength() - 0.01));
    const angle = Math.atan2(tip.y - tangent.y, tip.x - tangent.x) * 180 / Math.PI;
    const scale = Math.min(marker.markerWidth.baseVal.value / marker.viewBox.baseVal.width,
      marker.markerHeight.baseVal.value / marker.viewBox.baseVal.height) * (marker.getAttribute("markerUnits") === "userSpaceOnUse" ? 1 : stroke);
    const matrix = DOMMatrix.fromMatrix(screen).translate(tip.x, tip.y).rotate(angle).scale(scale)
      .translate(-marker.refX.baseVal.value, -marker.refY.baseVal.value);
    const symbolBox = symbol.getBBox();
    const padding = Number.parseFloat(getComputedStyle(symbol).strokeWidth) / 2;
    const corners = [symbolBox.x - padding, symbolBox.x + symbolBox.width + padding].flatMap((x) =>
      [symbolBox.y - padding, symbolBox.y + symbolBox.height + padding].map((y) => new DOMPoint(x, y).matrixTransform(matrix)));
    const left = Math.min(...corners.map(({ x }) => x));
    const top = Math.min(...corners.map(({ y }) => y));
    shapes.push({ kind: "arrow", id, bounds: { x: left, y: top,
      width: Math.max(...corners.map(({ x }) => x)) - left, height: Math.max(...corners.map(({ y }) => y)) - top } });
    return { id, d: path.getAttribute("d"), stroke };
  });
  for (const label of flow.querySelectorAll<HTMLElement>("[data-interface-label]")) {
    shapes.push({ kind: "label", id: JSON.stringify([label.dataset.interfaceId, label.dataset.consumerId, label.dataset.ownerId]),
      bounds: rectangle(label.getBoundingClientRect()) });
  }
  return { canvas: rectangle(flow.getBoundingClientRect()), camera: { x: transform.e, y: transform.f, zoom: transform.a },
    nodes, paths, shapes, panel: document.querySelector<HTMLElement>('[role="dialog"]')?.innerText ?? null };
}

export type InterfaceViewObservation = ReturnType<typeof observeInterfaceView>;

export function clippedInterfaceShapes(view: InterfaceViewObservation): string[] {
  return view.shapes.filter(({ bounds }) => bounds.x < view.canvas.x - 1 || bounds.y < view.canvas.y - 1
    || bounds.x + bounds.width > view.canvas.x + view.canvas.width + 1
    || bounds.y + bounds.height > view.canvas.y + view.canvas.height + 1).map(({ kind, id }) => `${kind}: ${id}`);
}
