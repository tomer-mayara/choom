import { Tabs } from "radix-ui";
import { useLayoutEffect, useState, type FocusEvent, type ReactNode, type RefObject } from "react";
import type { Baseline, BaselineInterface } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import { InterfaceOverview, InterfaceProvider, InterfaceRecordedStatus } from "./interface-overview.tsx";
import { InterfaceExamples } from "./interface-examples.tsx";
import { useExampleCopy } from "./use-example-copy.ts";
import { revealInterfaceFocus, useInterfaceTabs } from "./use-interface-tabs.ts";
import { useInterfaceDisclosures } from "./use-interface-disclosures.ts";
import { InterfaceSources } from "./interface-sources.tsx";

// Radix mounts tab contents after its first commit; restore against that content's height.
function TabBody({ restore, children }: { restore: () => void; children: ReactNode }) {
  useLayoutEffect(restore, [restore]);
  return children;
}

export function InterfaceDetails({ baseline, item, contentRef }: {
  baseline: ReadonlyData<Baseline>; item: ReadonlyData<BaselineInterface>;
  contentRef?: RefObject<HTMLDivElement | null>;
}) {
  const tabs = useInterfaceTabs(contentRef);
  const disclosure = useInterfaceDisclosures(contentRef);
  const [entryId, setEntryId] = useState(item.documentation?.entries[0]?.id);
  const entry = item.documentation?.entries.find(({ id }) => id === entryId);
  const [exampleId, setExampleId] = useState(entry?.examples[0]?.id);
  const [resultOpen, setResultOpen] = useState(false);
  const example = entry?.examples.find(({ id }) => id === exampleId);
  const copy = useExampleCopy();
  function revealFocusedControl(event: FocusEvent<HTMLDivElement>) {
    // Pointer focus must not move a pressed control before release.
    if (event.target !== event.currentTarget && event.target.matches(":focus-visible") && contentRef?.current) {
      revealInterfaceFocus(contentRef.current);
    }
  }
  function selectEntry(id: string) {
    if (id === entryId) return;
    setEntryId(id);
    setExampleId(item.documentation?.entries.find((candidate) => candidate.id === id)?.examples[0]?.id);
    setResultOpen(false);
    copy.reset();
    tabs.resetExample();
  }
  function selectExample(id: string) {
    if (id === exampleId) return;
    setExampleId(id);
    setResultOpen(false);
    copy.reset();
    tabs.resetExample();
  }
  return <section className="space-y-4 wrap-anywhere">
    <h2 className="text-lg font-semibold">{item.name}</h2>
    <InterfaceRecordedStatus item={item} />
    <InterfaceProvider baseline={baseline} item={item} />
    <Tabs.Root value={tabs.tab} onValueChange={tabs.changeTab} className="space-y-4">
      <Tabs.List aria-label="Interface views" className="sticky top-0 z-10 flex gap-1 border-b border-border bg-card">
        {["Overview", "Example", "Sources"].map((name) => <Tabs.Trigger key={name} value={name.toLowerCase()}
          className="min-w-0 flex-1 rounded-t px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:font-semibold">{name}</Tabs.Trigger>)}
      </Tabs.List>
      <Tabs.Content value="overview" onFocus={revealFocusedControl} className="focus-visible:outline-2 focus-visible:outline-ring">
        <TabBody restore={tabs.restore}><InterfaceOverview baseline={baseline} item={item} entry={entry} selectEntry={selectEntry} disclosure={disclosure} /></TabBody>
      </Tabs.Content>
      <Tabs.Content value="example" onFocus={revealFocusedControl} className="focus-visible:outline-2 focus-visible:outline-ring">
        <TabBody restore={tabs.restore}><InterfaceExamples entry={entry} example={example} selectExample={selectExample} resultOpen={resultOpen} setResultOpen={setResultOpen}
          onCopy={() => { if (example) void copy.write(example.content.value.text); }} copyFeedback={copy.feedback}
          showEntryId={Boolean(entry && item.documentation?.entries.some((other) => other.id !== entry.id && other.name === entry.name))} /></TabBody>
      </Tabs.Content>
      <Tabs.Content value="sources" onFocus={revealFocusedControl} className="space-y-4 focus-visible:outline-2 focus-visible:outline-ring">
        <TabBody restore={tabs.restore}><InterfaceSources item={item} disclosure={disclosure} /></TabBody>
      </Tabs.Content>
    </Tabs.Root>
  </section>;
}
