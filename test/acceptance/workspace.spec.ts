import { expect, test } from "@playwright/test";

test("opens and closes the architecture example without browser errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Architecture starts here." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore example" }).click();
  await expect(
    page.getByText("React interface", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Architecture model", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Tauri desktop", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close example" }).click();
  await expect(page.getByLabel("Example architecture diagram")).toHaveCount(0);
  expect(errors).toEqual([]);
});
