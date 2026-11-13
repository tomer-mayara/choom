import { useState, type ReactNode, type RefObject } from "react";
import type {
  Baseline, BaselineComponent, BaselineResource, BaselineRule,
  BaselineAccessPointsStatement, BaselineComponentReferenceStatement, BaselineConsumersStatement,
  BaselineMembershipStatement, BaselineNullableTextStatement, BaselinePromisesStatement, BaselineRuleObjectStatement, BaselineTextStatement,
} from "../domain/generated/contracts.ts";
import type { ReadonlyData } from "../domain/readonly-data.ts";
import { InterfaceDetails } from "./interface-details.tsx";

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

export function ArchitectureDetails({ baseline, panel, showHeading = true, contentRef }: {
  baseline: ReadonlyData<Baseline>; panel: ArchitecturePanel; showHeading?: boolean; contentRef?: RefObject<HTMLDivElement | null>;
}) {
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
  if ("allowedConsumers" in item) return <InterfaceDetails key={item.id} baseline={baseline} item={item} contentRef={contentRef} />;
  const kind = panel.kind === "component" ? "Component" : panel.kind === "interface" ? "Interface" : "Resource";
  return (
    <section className="space-y-4 wrap-anywhere">
      {showHeading ? <h2 className="text-lg font-semibold">{item.name}</h2> : null}
      <Field name={`${kind} ID`}><RecordedValue value={item.id} /></Field>
      {"purpose" in item ? <ComponentFields item={item} /> : <ResourceFields item={item} />}
    </section>
  );
}
