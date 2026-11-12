import { fireEvent } from "@testing-library/react";

/** Include the press and release that belong to a real pointer click. */
export function pointerClick(element: HTMLElement): void {
  fireEvent.pointerDown(element, { pointerId: 1, isPrimary: true, button: 0 });
  fireEvent.pointerUp(window, { pointerId: 1 });
  fireEvent.click(element, { detail: 1 });
}
