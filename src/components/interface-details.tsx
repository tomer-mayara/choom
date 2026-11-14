import { Tabs } from "radix-ui";
import { useState, type ReactNode } from "react";
import type { Baseline, BaselineInterface } from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import { InterfaceOverview, InterfaceProvider, InterfaceRecordedStatus } from "./interface-overview.tsx";

export function InterfaceDetails({ baseline, item, children }: {
  baseline: ReadonlyData<Baseline>; item: ReadonlyData<BaselineInterface>; children: ReactNode;
}) {
  const [tab, setTab] = useState("overview");
  const [entryId, setEntryId] = useState(item.documentation?.entries[0]?.id);
  const entry = item.documentation?.entries.find(({ id }) => id === entryId);
  return <section className="space-y-4 wrap-anywhere">
    <h2 className="text-lg font-semibold">{item.name}</h2>
    <InterfaceRecordedStatus item={item} />
    <InterfaceProvider baseline={baseline} item={item} />
    <Tabs.Root value={tab} onValueChange={setTab} className="space-y-4">
      <Tabs.List aria-label="Interface views" className="flex gap-1 border-b border-border">
        {["Overview", "Sources"].map((name) => <Tabs.Trigger key={name} value={name.toLowerCase()}
          className="min-w-0 flex-1 rounded-t px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:font-semibold">{name}</Tabs.Trigger>)}
      </Tabs.List>
      <Tabs.Content value="overview" className="focus-visible:outline-2 focus-visible:outline-ring">
        <InterfaceOverview baseline={baseline} item={item} entry={entry} selectEntry={setEntryId} />
      </Tabs.Content>
      <Tabs.Content value="sources" className="space-y-4 focus-visible:outline-2 focus-visible:outline-ring">{children}</Tabs.Content>
    </Tabs.Root>
  </section>;
}
