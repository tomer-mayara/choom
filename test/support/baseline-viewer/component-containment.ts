import { expect, type Page } from "@playwright/test";

/**
 * Checks the drawing of an open baseline: each child component appears inside its
 * parent group, below the inspection control of the parent.
 */
export async function assertContained(page: Page, baselineId: string, parentId: string, childIds: string[]): Promise<void> {
  await expect(page.getByRole("heading", { name: baselineId, exact: true })).toBeVisible();
  const parentNode = page.locator(`.react-flow__node[data-id="${parentId}"]`);
  await expect(parentNode).toBeVisible();
  await expect.poll(() => page.evaluate(({ parentId, childIds }) => {
    const parentNode = document.querySelector(`.react-flow__node[data-id="${parentId}"]`);
    const parent = parentNode?.getBoundingClientRect();
    const header = parentNode?.querySelector("button")?.getBoundingClientRect();
    if (!parent || !header) return false;
    return childIds.every((childId) => {
      const child = document.querySelector(`.react-flow__node[data-id="${childId}"]`)?.getBoundingClientRect();
      return child !== undefined && child.x >= parent.x - 1 && child.y >= header.y + header.height - 1
        && child.right <= parent.right + 1 && child.bottom <= parent.bottom + 1;
    });
  }, { parentId, childIds }), {
    message: `The children must appear inside ${parentId}, below its inspection control.`,
  }).toBe(true);
}
