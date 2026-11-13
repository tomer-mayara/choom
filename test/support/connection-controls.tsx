import { fireEvent, screen } from "@testing-library/react";

export function showAllConnections() {
  fireEvent.click(screen.getByRole("radio", { name: "All" }));
}
