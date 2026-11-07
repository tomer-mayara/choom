import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import App from "../../src/App";

afterEach(cleanup);

test("renders a browser workspace without desktop-only actions", () => {
  render(<App />);
  const actions = within(screen.getByRole("navigation", { name: "Workspace actions" }));
  expect(
    screen.getByRole("heading", { name: "Architecture starts here." }),
  ).toBeTruthy();
  expect(screen.getByText("Browser", { exact: true })).toBeTruthy();
  expect(actions.getByRole("button", { name: "Open Diagram" })).toBeTruthy();
  expect(
    actions
      .getByRole("button", { name: "Explore example" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  expect(screen.queryByRole("button", { name: "Choose directory" })).toBeNull();
});
