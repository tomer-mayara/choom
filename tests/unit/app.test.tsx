import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import App from "../../src/App";

afterEach(cleanup);

test("renders a browser workspace without desktop-only actions", () => {
  render(<App />);
  expect(
    screen.getByRole("heading", { name: "Architecture starts here." }),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Explore example" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  expect(screen.queryByRole("button", { name: "Choose directory" })).toBeNull();
});
