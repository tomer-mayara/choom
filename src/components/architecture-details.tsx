import { useState, type ReactNode, type RefObject } from "react";
import type {
  Baseline, BaselineComponent, BaselineComponentV5, BaselineResource, BaselineRule, BaselineSymbolSelector,
  BaselineAccessPointsStatement, BaselineComponentReferenceStatement, BaselineConsumersStatement,
  BaselineMembershipStatement, BaselineMembershipV5Statement, BaselineNullableTextStatement, BaselinePromisesStatement,
  BaselineRuleObjectStatement, BaselineTextStatement,
} from "@choom/baseline-model/contracts";
import type { ReadonlyData } from "@choom/baseline-model/readonly-data";
import { InterfaceDetails } from "./interface-details.tsx";
import type { InterfaceReadingState } from "./interface-reading-state.ts";
import { systemEntryReview } from "../lib/system-entry-points.ts";
import { supportsSourceUsage, supportsSymbolSelectors } from "@choom/baseline-model/baseline-format";

export type ArchitecturePanel = { kind: "component"; componentId: string }
  | { kind: "interface"; interfaceId: string; entryId?: string }
  | { kind: "resource"; resourceId: string } | { kind: "baseline" } | { kind: "rules" }
  | { kind: "duplicates"; componentId?: string; interfaceId?: string }
  | { kind: "duplicate"; findingId: string };

type Statement = ReadonlyData<BaselineTextStatement | BaselineMembershipStatement | BaselineMembershipV5Statement
  | BaselineComponentReferenceStatement | BaselineAccessPointsStatement | BaselineConsumersStatement | BaselineNullableTextStatement
  | BaselinePromisesStatement | BaselineRuleObjectStatement>;

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

function SymbolSelectors({ symbols }: { symbols: readonly ReadonlyData<BaselineSymbolSelector>[] | undefined }) {
  if (!symbols?.length) return <RecordedValue value={symbols} />;
  return <ul className="space-y-1 text-sm">
    {symbols.map(({ path, symbol }) => <li key={JSON.stringify([path, symbol])}><code>{symbol}</code> in <code>{path}</code></li>)}
  </ul>;
}

function ComponentFields({ item, symbolFormat }: { item: ReadonlyData<BaselineComponent | BaselineComponentV5>; symbolFormat: boolean }) {
  const membership = item.membership.value;
  return <>
    <StatementDetails name="Purpose" statement={item.purpose} />
    <StatementDetails name="Membership" statement={item.membership}>
      <Field name="Paths"><RecordedValue value={membership.paths} /></Field>
      <Field name="Excluded paths"><RecordedValue value={membership.excludePaths} /></Field>
      {symbolFormat ? <Field name="Symbols">
        <SymbolSelectors symbols={"symbols" in membership ? membership.symbols : undefined} />
      </Field> : null}
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

function SystemEntryReview({ baseline }: { baseline: ReadonlyData<Baseline> }) {
  const { assessment, notices } = systemEntryReview(baseline);
  return <section aria-label="System entry point review" className="space-y-3">
    <h3 className="font-semibold">System entry point review</h3>
    {notices.map((notice) => <p key={notice} className="text-sm text-muted-foreground">{notice}</p>)}
    {assessment ? <>
      <Field name="Reviewed scope"><RecordedValue value={assessment.scope} /></Field>
      <Field name="Scope evidence">
        <ul className="list-disc pl-5">{assessment.evidenceRefs.map((reference) => <li key={reference}><code className="wrap-anywhere">{reference}</code></li>)}</ul>
      </Field>
      {assessment.limitations.length ? <Field name="Review limits">
        <ul className="list-disc pl-5">{assessment.limitations.map((limit, index) => <li key={index}><RecordedValue value={limit} /></li>)}</ul>
      </Field> : null}
    </> : null}
  </section>;
}

export function ArchitectureDetails({ baseline, panel, showHeading = true, contentRef, reading }: {
  baseline: ReadonlyData<Baseline>; panel: ArchitecturePanel; showHeading?: boolean; contentRef?: RefObject<HTMLDivElement | null>;
  reading?: InterfaceReadingState;
}) {
  if (panel.kind === "duplicates" || panel.kind === "duplicate") return null;
  if (panel.kind === "baseline") return <section className="space-y-4 wrap-anywhere">
    <Field name="Format version"><RecordedValue value={baseline.formatVersion} /></Field>
    <Field name="Baseline ID"><RecordedValue value={baseline.id} /></Field>
    <Field name="Parent baseline ID">
      {baseline.parentId === null ? <p className="text-muted-foreground">No parent baseline (null)</p> : <RecordedValue value={baseline.parentId} />}
    </Field>
    <SystemEntryReview baseline={baseline} />
    {supportsSourceUsage(baseline) && baseline.sourceUsage ? <details data-section="original-source-usage" className="rounded-lg border border-border p-3">
      <summary className="cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-ring">Original source-use data</summary>
      <RecordedValue value={baseline.sourceUsage} />
    </details> : null}
  </section>;
  if (panel.kind === "rules") return <div className="space-y-3 wrap-anywhere">
    {baseline.rules.length === 0 ? <p>No rules modeled</p> : baseline.rules.map((rule) => <RuleRow key={rule.id} rule={rule} />)}
  </div>;
  const item = panel.kind === "component" ? baseline.components.find(({ id }) => id === panel.componentId)
    : panel.kind === "interface" ? baseline.interfaces.find(({ id }) => id === panel.interfaceId)
      : baseline.resources.find(({ id }) => id === panel.resourceId);
  if (!item) return null;
  if ("allowedConsumers" in item) return <InterfaceDetails key={item.id} baseline={baseline} item={item} contentRef={contentRef}
    initialEntryId={panel.kind === "interface" ? panel.entryId : undefined} reading={reading} />;
  const kind = panel.kind === "component" ? "Component" : panel.kind === "interface" ? "Interface" : "Resource";
  return (
    <section className="space-y-4 wrap-anywhere">
      {showHeading ? <h2 className="text-lg font-semibold">{item.name}</h2> : null}
      <Field name={`${kind} ID`}><RecordedValue value={item.id} /></Field>
      {"purpose" in item ? <ComponentFields item={item} symbolFormat={supportsSymbolSelectors(baseline)} /> : <ResourceFields item={item} />}
    </section>
  );
}
