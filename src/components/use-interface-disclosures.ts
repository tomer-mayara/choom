import { useLayoutEffect, useState, type RefObject, type SyntheticEvent } from "react";
import { revealInterfaceFocus } from "./use-interface-tabs.ts";
import type { InterfaceReadingState } from "./interface-reading-state.ts";

/** Native disclosure choices belong to the mounted interface, not its active tab. */
export function useInterfaceDisclosures(content?: RefObject<HTMLDivElement | null>, reading?: InterfaceReadingState) {
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => reading?.opened ?? new Set());
  useLayoutEffect(() => {
    // A deferred native toggle can move the next focused control after Tab.
    if (content?.current) revealInterfaceFocus(content.current);
  }, [content, opened]);
  return (key: string) => ({
    open: opened.has(key),
    onToggle(event: SyntheticEvent<HTMLDetailsElement>) {
      const open = event.currentTarget.open;
      setOpened((current) => {
        if (current.has(key) === open) return current;
        const next = new Set(current);
        if (open) next.add(key); else next.delete(key);
        if (reading) reading.opened = next;
        return next;
      });
    },
  });
}

export type InterfaceDisclosure = ReturnType<typeof useInterfaceDisclosures>;
