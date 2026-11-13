import type { Locator, Page } from "@playwright/test";

/** Pick an exposed point on the actual SVG stroke, outside labels and headers. */
export async function unobscuredArcPoint(arc: Locator) {
  return arc.evaluate((element) => {
    const path = element as SVGPathElement;
    const matrix = path.getScreenCTM();
    const canvas = path.closest(".react-flow")?.getBoundingClientRect();
    if (!matrix || !canvas) throw new Error("The arc must belong to a visible canvas.");
    for (let index = 1; index < 20; index += 1) {
      const point = path.getPointAtLength(path.getTotalLength() * index / 20).matrixTransform(matrix);
      const hit = document.elementFromPoint(point.x, point.y);
      if (point.x > canvas.left + 16 && point.x < canvas.right - 16 && point.y > canvas.top + 16 && point.y < canvas.bottom - 16
        && !hit?.closest("button, .react-flow__node") && hit?.closest(".react-flow__edge")?.querySelector("[data-interface-arc]") === path) {
        return { x: point.x, y: point.y };
      }
    }
    throw new Error("The curve needs an unobscured pointer target.");
  });
}

/** Reveal a pointer label through its curve before aiming at its text. */
export async function hoverArcLabel(page: Page, label: Locator) {
  const selector = await label.evaluate((element) => "path[data-interface-arc]" + ["interface-id", "consumer-id", "owner-id"].map((key) =>
    `[data-${key}="${CSS.escape(element.getAttribute(`data-${key}`) ?? "")}"]`).join(""));
  const point = await unobscuredArcPoint(page.locator(selector));
  await page.mouse.move(point.x, point.y);
  await label.hover();
}
