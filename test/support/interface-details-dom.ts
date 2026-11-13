import { parseInterfaceRecord } from "./interface-record.ts";
import { fireEvent, screen } from "@testing-library/react";

export function selectInterfaceTab(name: string) {
  fireEvent.keyDown(screen.getByRole("tab", { name }), { key: "Enter" });
}


export function originalInterfaceRecord(): Record<string, unknown> {
  selectInterfaceTab("Sources");
  const summary = screen.getByText("Original record", { selector: "summary" });
  const details = summary.closest("details");
  if (!details?.open) fireEvent.click(summary);
  return parseInterfaceRecord(details?.querySelector("pre")?.textContent ?? "null");
}
