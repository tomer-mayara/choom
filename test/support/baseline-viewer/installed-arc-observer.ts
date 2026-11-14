import type { Browser } from "webdriverio";

/** Read the ordinary installed drawing without dispatching input or changing it. */
export async function observeInstalledArcs(browser: Browser) {
  return browser.execute(() => {
    const canvasElement = document.querySelector<HTMLElement>(".react-flow");
    const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
    if (!canvasElement || !viewport) throw new Error("The installed arc journey needs a component drawing");
    const canvas = canvasElement.getBoundingClientRect();
    const rect = (value: DOMRect) => ({ x: value.x, y: value.y, width: value.width, height: value.height });
    const identity = (element: Element | null) => element ? ["interface", "consumer", "owner"]
      .map((kind) => element.getAttribute(`data-${kind}-id`)).join("/") : null;
    const painted = (element: Element) => {
      for (let current: Element | null = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0) return false;
      }
      return element.getClientRects().length > 0;
    };
    const camera = new DOMMatrixReadOnly(getComputedStyle(viewport).transform);
    // Apply the observed CSS camera so endpoints include the same zoom as headers.
    const matrix = new DOMMatrixReadOnly().translate(canvas.x, canvas.y).multiply(camera);
    const panel = document.querySelector<HTMLElement>('[role="dialog"]');
    const panelRecord = () => ({
      panelTitle: panel?.querySelector("#inspection-title")?.textContent?.trim() ?? "",
      panelText: panel?.innerText.trim() ?? "", back: Boolean(panel?.querySelector('button[aria-label="Back"]')),
      originalRecord: panel?.querySelector("details[data-section='original-interface-record'] pre")?.textContent ?? null,
      fields: Object.fromEntries(["Interface ID", "Owner", "Allowed consumers", "Public access", "Promises"].map((name) =>
        [name, panel?.querySelector<HTMLElement>(`[role="group"][aria-label="${name}"]`)?.innerText ?? ""])),
    });
    const labels = Array.from(document.querySelectorAll<HTMLButtonElement>("button[data-interface-label]"), (label) => {
      const style = getComputedStyle(label);
      return { id: identity(label), bounds: rect(label.getBoundingClientRect()), name: label.getAttribute("aria-label"),
        painted: painted(label), background: style.backgroundColor, pointerEvents: style.pointerEvents,
        outline: { width: Number.parseFloat(style.outlineWidth), style: style.outlineStyle }, tabIndex: label.tabIndex };
    });
    const modes = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="connection-mode"]'));
    const self = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find((control) =>
      control.getAttribute("aria-label") === "Show self-connections"
      || Array.from(control.labels ?? []).some((label) => label.textContent?.trim() === "Show self-connections"));
    return {
      camera: { x: camera.e, y: camera.f, zoom: camera.a }, canvas: rect(canvas),
      nativeScroll: { canvasX: canvasElement.scrollLeft, canvasY: canvasElement.scrollTop,
        viewportX: viewport.scrollLeft, viewportY: viewport.scrollTop },
      choices: { modes: modes.map(({ value }) => value), mode: modes.find(({ checked }) => checked)?.value ?? null,
        showSelf: self?.checked ?? null },
      focusedChoice: document.activeElement === self ? "self" : modes.find((control) => document.activeElement === control)?.value ?? null,
      emptyMessage: Array.from(document.querySelectorAll("p")).some((element) =>
        element.textContent?.trim() === "No connections shown." && painted(element)),
      nodes: Array.from(document.querySelectorAll<HTMLElement>(".react-flow__node[data-id]"), (node) => {
        const style = getComputedStyle(node);
        const position = new DOMMatrixReadOnly(style.transform);
        const header = node.querySelector('button[aria-haspopup="dialog"]');
        if (!header) throw new Error("An installed component is missing its header");
        return { id: node.getAttribute("data-id"), x: position.e, y: position.f,
          width: Number.parseFloat(style.width), height: Number.parseFloat(style.height),
          bounds: rect(node.getBoundingClientRect()), header: rect(header.getBoundingClientRect()),
          text: header.textContent?.trim() ?? "" };
      }),
      arcs: Array.from(document.querySelectorAll<SVGPathElement>("path[data-interface-arc]"), (path) => {
        const interfaceId = path.getAttribute("data-interface-id");
        const consumerId = path.getAttribute("data-consumer-id");
        const ownerId = path.getAttribute("data-owner-id");
        const label = labels.find((entry) => entry.id === identity(path));
        if (!label) throw new Error("An installed arc needs its retained label control");
        const start = matrix.transformPoint(path.getPointAtLength(0));
        const length = path.getTotalLength();
        const tip = path.getPointAtLength(length);
        const end = matrix.transformPoint(tip);
        const markerId = path.getAttribute("marker-end")?.match(/^url\(\s*(['"]?)#(.+?)\1\s*\)$/)?.[2];
        const marker = markerId ? document.getElementById(markerId) : null;
        if (!(marker instanceof SVGMarkerElement)) throw new Error("An installed arc needs a rendered arrowhead");
        const shape = marker.querySelector<SVGGraphicsElement>("polyline, polygon, path");
        if (!shape) throw new Error("The installed arrowhead needs a visible shape");
        const box = shape.getBBox();
        const markerView = marker.viewBox.baseVal;
        const pathStroke = Number.parseFloat(getComputedStyle(path).strokeWidth);
        const units = marker.getAttribute("markerUnits") === "userSpaceOnUse" ? 1 : pathStroke;
        const scale = Math.min(marker.markerWidth.baseVal.value / markerView.width, marker.markerHeight.baseVal.value / markerView.height) * units;
        const previous = path.getPointAtLength(Math.max(0, length - 0.01));
        const angle = Math.atan2(tip.y - previous.y, tip.x - previous.x);
        const stroke = getComputedStyle(shape).stroke === "none" ? 0 : Number.parseFloat(getComputedStyle(shape).strokeWidth) / 2;
        // Observe the SVG marker at the path tip; path bounds alone omit it.
        const corners = [box.x - stroke, box.x + box.width + stroke].flatMap((x) =>
          [box.y - stroke, box.y + box.height + stroke].map((y) => {
            const dx = (x - marker.refX.baseVal.value) * scale;
            const dy = (y - marker.refY.baseVal.value) * scale;
            return matrix.transformPoint({ x: tip.x + dx * Math.cos(angle) - dy * Math.sin(angle),
              y: tip.y + dx * Math.sin(angle) + dy * Math.cos(angle) });
          }));
        const left = Math.min(...corners.map(({ x }) => x));
        const top = Math.min(...corners.map(({ y }) => y));
        const curve = path.getBoundingClientRect();
        const margin = pathStroke * camera.a / 2;
        return { id: identity(path), interfaceId, consumerId, ownerId, d: path.getAttribute("d"),
          arrow: path.getAttribute("marker-end"),
          bounds: { x: curve.x - margin, y: curve.y - margin, width: curve.width + 2 * margin, height: curve.height + 2 * margin },
          arrowBounds: { x: left, y: top, width: Math.max(...corners.map(({ x }) => x)) - left,
            height: Math.max(...corners.map(({ y }) => y)) - top }, label,
          start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
      }),
      labels,
      ...panelRecord(),
      focusedArc: identity(document.activeElement?.closest("[data-interface-label]") ?? null),
      focusedNode: document.activeElement?.closest(".react-flow__node")?.getAttribute("data-id") ?? null,
      focusedRecord: document.activeElement?.getAttribute("data-record-id") ?? null,
      focusedHeading: document.activeElement?.id === "inspection-title",
    };
  });
}

export type InstalledArcState = Awaited<ReturnType<typeof observeInstalledArcs>>;

export function installedDrawingFits(state: InstalledArcState): boolean {
  const inside = (box: InstalledArcState["canvas"]) => box.x >= state.canvas.x - 1 && box.y >= state.canvas.y - 1
    && box.x + box.width <= state.canvas.x + state.canvas.width + 1
    && box.y + box.height <= state.canvas.y + state.canvas.height + 1;
  return Number.isFinite(state.camera.zoom) && state.camera.zoom > 0
    && state.nodes.every(({ bounds }) => inside(bounds))
    && state.arcs.every(({ bounds, arrowBounds }) => inside(bounds) && inside(arrowBounds))
    && state.labels.filter(({ painted }) => painted).every(({ bounds }) => inside(bounds));
}
