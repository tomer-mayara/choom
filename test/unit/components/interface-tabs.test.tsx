import { afterEach, expect, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useInterfaceTabs } from "../../../src/components/use-interface-tabs.ts";

afterEach(cleanup);

test("focus followed by the same mouse-down transition cannot replace the old tab bookmark", () => {
  const content = { current: document.createElement("div") };
  const { result } = renderHook(() => useInterfaceTabs(content));
  act(() => result.current.changeTab("example"));
  content.current.scrollTop = 600;
  // Radix can call the same event handler once for focus and again for mouse-down.
  const transition = result.current.changeTab;
  act(() => transition("sources"));
  content.current.scrollTop = 148;
  act(() => transition("sources"));
  act(() => result.current.changeTab("example"));
  act(() => result.current.restore());
  expect(content.current.scrollTop).toBe(600);
});


test("rapid distinct tab requests keep their requested order", () => {
  const { result } = renderHook(() => useInterfaceTabs());
  act(() => {
    result.current.changeTab("example");
    result.current.changeTab("sources");
    result.current.changeTab("overview");
  });
  expect(result.current.tab).toBe("overview");
});
