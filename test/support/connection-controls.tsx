import { fireEvent, screen } from "@testing-library/react";

export function showAllConnections() {
  fireEvent.click(screen.getByRole("radio", { name: "All" }));
}

export function showSelfConnections() {
  const control = screen.getByRole<HTMLInputElement>("checkbox", { name: "Show self-connections" });
  if (!control.checked) fireEvent.click(control);
}
