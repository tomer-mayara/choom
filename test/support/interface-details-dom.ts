import { fireEvent, screen } from "@testing-library/react";

export function selectInterfaceTab(name: string) {
  fireEvent.keyDown(screen.getByRole("tab", { name }), { key: "Enter" });
}
