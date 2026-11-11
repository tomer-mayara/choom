import { useState, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type {
  Baseline, BaselineComponent, BaselineInterface, BaselineResource, BaselineRule,
  BaselineAccessPointsStatement, BaselineComponentReferenceStatement, BaselineConsumersStatement,
  BaselineMembershipStatement, BaselineNullableTextStatement, BaselinePromisesStatement, BaselineRuleObjectStatement, BaselineTextStatement,
} from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import { Button } from "./ui/button.tsx";

export type ArchitecturePanel = { kind: "component"; componentId: string }
  | { kind: "interface"; interfaceId: string }
  | { kind: "resource"; resourceId: string } | { kind: "baseline" } | { kind: "rules" };

type Statement = ReadonlyData<BaselineTextStatement | BaselineMembershipStatement | BaselineComponentReferenceStatement
  | BaselineAccessPointsStatement | BaselineConsumersStatement | BaselineNullableTextStatement | BaselinePromisesStatement | BaselineRuleObjectStatement>;

function RecordedValue({ value }: { value: unknown }) {
  if (value === undefined) return <p className="text-muted-foreground">Not recorded</p>;
  if (value === null) return <p className="text-muted-foreground">Unknown (null)</p>;
  if (typeof value === "object") return <pre className="whitespace-pre-wrap wrap-anywhere text-xs">{JSON.stringify(value, null, 2)}</pre>;
  return <p className="whitespace-pre-wrap wrap-anywhere">{String(value)}</p>;
}

function Field({ name, children }: { name: string; children: ReactNode }) {
  return <div role="group" aria-label={name} className="space-y-1 text-sm">
    <p className="font-semibold">{name}</p>{children}
  </div>;
}

function StatementDetails({ name, statement, children }: { name: string; statement: Statement; children?: ReactNode }) {
  return <Field name={name}>
    {children ?? <RecordedValue value={statement.value} />}
    <p className="text-xs font-medium">{statement.status === "accepted" ? "Accepted (recorded)" : "Proposed"}</p>
    <p className="text-xs text-muted-foreground">Evidence not loaded</p>
    <Field name="Evidence references"><RecordedValue value={statement.evidenceRefs} /></Field>
    {statement.status === "accepted" ? <Field name="Acceptance reference"><RecordedValue value={statement.acceptanceRef} /></Field> : null}
  </Field>;
}

function ComponentFields({ item }: { item: ReadonlyData<BaselineComponent> }) {
  return <>
    <StatementDetails name="Purpose" statement={item.purpose} />
    <StatementDetails name="Membership" statement={item.membership}>
      <Field name="Paths"><RecordedValue value={item.membership.value.paths} /></Field>
      <Field name="Excluded paths"><RecordedValue value={item.membership.value.excludePaths} /></Field>
    </StatementDetails>
    <StatementDetails name="Grouping reason" statement={item.groupingReason} />
    {item.parent ? <StatementDetails name="Parent" statement={item.parent} /> : <Field name="Parent"><RecordedValue value={undefined} /></Field>}
  </>;
}

function InterfaceFields({ item }: { item: ReadonlyData<BaselineInterface> }) {
  const promises = item.promises.value;
  return <>
    <StatementDetails name="Owner" statement={item.owner} />
    <StatementDetails name="Public access" statement={item.publicAccess} />
    <StatementDetails name="Allowed consumers" statement={item.allowedConsumers} />
    <StatementDetails name="Promises" statement={item.promises}>
      {promises ? <>
        <Field name="Behavior"><RecordedValue value={promises.behavior} /></Field>
        <Field name="Data"><RecordedValue value={promises.data} /></Field>
        <Field name="Errors"><RecordedValue value={promises.errors} /></Field>
        <Field name="Lifecycle"><RecordedValue value={promises.lifecycle} /></Field>
      </> : <RecordedValue value={null} />}
    </StatementDetails>
  </>;
}

function ResourceFields({ item }: { item: ReadonlyData<BaselineResource> }) {
  return <>
    <StatementDetails name="Identity" statement={item.identity} />
    <StatementDetails name="Owner" statement={item.owner} />
    <StatementDetails name="Access rules" statement={item.accessRules} />
  </>;
}

function RuleRow({ rule }: { rule: ReadonlyData<BaselineRule> }) {
  const [expanded, setExpanded] = useState(false);
  return <details className="rounded-lg border border-border" onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary className="cursor-pointer rounded-lg p-3 wrap-anywhere focus-visible:outline-2 focus-visible:outline-ring">
      <span className="font-semibold">{rule.name}</span>
      <code className="block text-xs text-muted-foreground">{rule.id}</code>
    </summary>
    {expanded ? <div className="space-y-4 border-t border-border p-3">
      <Field name="Rule ID"><RecordedValue value={rule.id} /></Field>
      <StatementDetails name="Subject" statement={rule.subject} />
      <StatementDetails name="Expected" statement={rule.expected} />
      <StatementDetails name="Check" statement={rule.check} />
    </div> : null}
  </details>;
}

export function ArchitectureDetails({ baseline, panel }: { baseline: ReadonlyData<Baseline>; panel: ArchitecturePanel }) {
  if (panel.kind === "baseline") return <section className="space-y-4 wrap-anywhere">
    <Field name="Format version"><RecordedValue value={baseline.formatVersion} /></Field>
    <Field name="Baseline ID"><RecordedValue value={baseline.id} /></Field>
    <Field name="Parent baseline ID">
      {baseline.parentId === null ? <p className="text-muted-foreground">No parent baseline (null)</p> : <RecordedValue value={baseline.parentId} />}
    </Field>
  </section>;
  if (panel.kind === "rules") return <div className="space-y-3 wrap-anywhere">
    {baseline.rules.length === 0 ? <p>No rules modeled</p> : baseline.rules.map((rule) => <RuleRow key={rule.id} rule={rule} />)}
  </div>;
  const item = panel.kind === "component" ? baseline.components.find(({ id }) => id === panel.componentId)
    : panel.kind === "interface" ? baseline.interfaces.find(({ id }) => id === panel.interfaceId)
      : baseline.resources.find(({ id }) => id === panel.resourceId);
  if (!item) return null;
  const kind = panel.kind === "component" ? "Component" : panel.kind === "interface" ? "Interface" : "Resource";
  return (
    <section className="space-y-4 wrap-anywhere">
      <h2 className="text-lg font-semibold">{item.name}</h2>
      <Field name={`${kind} ID`}><RecordedValue value={item.id} /></Field>
      {"purpose" in item ? <ComponentFields item={item} />
        : "allowedConsumers" in item ? <InterfaceFields item={item} /> : <ResourceFields item={item} />}
    </section>
  );
}

export function ArchitectureDetailsPanel({ baseline, panel, opener, onClose }: {
  baseline: ReadonlyData<Baseline>; panel: ArchitecturePanel | null;
  opener: RefObject<HTMLElement | null>; onClose: () => void;
}) {
  const titles = { component: "Component details", interface: "Interface details", resource: "Resource details", baseline: "Baseline details", rules: "Rules" };
  return <Dialog.Root open={panel !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/10" />
      <Dialog.Content
        className="fixed inset-y-0 right-0 z-50 flex h-dvh w-full max-w-md flex-col border-l border-border bg-card shadow-xl focus:outline-none"
        onCloseAutoFocus={(event) => { event.preventDefault(); if (opener.current?.isConnected) opener.current.focus(); }}
        onEscapeKeyDown={(event) => {
          if (panel?.kind !== "rules" || !(event.target instanceof Element)) return;
          const row = event.target.closest("details[open]");
          if (!(row instanceof HTMLDetailsElement)) return;
          event.preventDefault();
          row.open = false;
          row.querySelector("summary")?.focus();
        }}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
          <Dialog.Title className="min-w-0 flex-1 text-base font-semibold">{titles[panel?.kind ?? "baseline"]}</Dialog.Title>
          <Dialog.Close asChild><Button variant="outline" aria-label="Close details" className="size-8 shrink-0 p-0"><X aria-hidden="true" className="size-4" /></Button></Dialog.Close>
        </div>
        <Dialog.Description className="sr-only">Recorded baseline data. Escape closes an expanded rule, then closes the panel.</Dialog.Description>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {panel ? <ArchitectureDetails baseline={baseline} panel={panel} /> : null}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
