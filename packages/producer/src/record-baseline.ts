import { isDeepStrictEqual } from 'node:util';
import { baselineSchema } from '@choom/baseline-model';
import { supportsSourceUsage, supportsSymbolSelectors, supportsSystemEntryPoints } from '@choom/baseline-model/baseline-format';
import type { Baseline, BaselineDecisions, BaselineDocumentation, BaselineInterface, BaselineSourceUse }
  from '@choom/baseline-model/contracts';
import { baselineStatements, documentationStatements, type DocumentationStatement, itemStatementFields, type StatementState }
  from '@choom/baseline-model/item-statements';
import { assert, type Fields, object, oneOf } from './record-checks.ts';
import type { MappedOwners } from './record-code-mapping.ts';
import { type SourceRecords, validateSourceLocation } from './record-sources.ts';

// The checks of a proposed baseline. The shared baseline rules in
// @choom/baseline-model check its shape, as the viewer does. The producer adds
// its profile, the viewer display limits, and the run checks against the saved
// records: the discovery result, the evidence registry, the saved source ranges
// and the selected code mapping.
const collectionKeys = ['components', 'interfaces', 'resources', 'rules'] as const;
const itemKinds = new Map<unknown, string>([['components', 'component'], ['interfaces', 'interface'],
  ['resources', 'resource'], ['rules', 'rule']]);
const producerVersions = [1, 2, 3, 4, 5, 6];

export interface BaselineInputs {
  baseline: Baseline;
  discovery: Fields;
  claim(id: unknown): void;
  evidence(record: unknown): void;
}
export interface BaselineMembers { componentIds: Set<unknown>; members: Map<unknown, Fields> }
export interface DocumentationInputs {
  baseline: Baseline;
  discovery: Fields;
  evidence(record: unknown): void;
  source: SourceRecords;
  reviewedRanges: Fields[];
}
export interface RunBaselineInputs extends DocumentationInputs {
  snapshotRef: string;
  componentIds: Set<unknown>;
  mapped: MappedOwners;
}
// One statement of an interface's documentation, its subject path, and the facts in it that can be null.
interface DocumentationCheck { path: string; statement: StatementState; facts: [string, unknown][] }
/**
 * The decision record that a next baseline version is made from. `link` is what
 * the version record gives: the ID of the record, its path in the run folder and
 * the SHA-256 of its bytes when the version was made. `saved` is the record that
 * the run folder holds: the SHA-256 of its bytes and its checked decisions.
 */
export interface VersionDecisions {
  link: { id: string; path: string; sha256: string };
  saved: { sha256: string; decisions: BaselineDecisions };
}

// Reads value?.[key] from an unchecked value.
const field = (value: unknown, key: string): unknown => (value as Fields | null | undefined)?.[key];
const statementValue = (item: Fields, name: string): unknown => (item[name] as Fields | undefined)?.value;
const items = (baseline: Baseline, key: typeof collectionKeys[number]): Fields[] => baseline[key] as unknown as Fields[];
const issueSubjects = (discovery: Fields): Set<unknown> => new Set([...(discovery.questions as Fields[]),
  ...(discovery.gaps as Fields[])].flatMap(issue => issue.subjectRefs as unknown[]));

// The parent of a baseline version. A first version has no parent. A next version
// has as its parent the baseline that its decision record decides about.
function checkParent(baseline: unknown, made: VersionDecisions | undefined): void {
  const parentId = field(baseline, 'parentId');
  if (made === undefined) {
    assert(parentId === null, 'Expected a first proposed baseline.');
    return;
  }
  const { link, saved } = made;
  assert(parentId === saved.decisions.baselineRef, 'The next version names ' + JSON.stringify(parentId) + ' as its parent, ' +
    'but the decision record ' + link.path + ' is for the baseline ' + saved.decisions.baselineRef + '.');
}

// Each component has at least one membership path. In version 5, a component can
// own only symbols, so it has at least one path or symbol.
function checkMembershipSelectors(component: unknown, id: string, version: unknown): void {
  const empty = (value: unknown): boolean => Array.isArray(value) && value.length === 0;
  const membership = field(field(component, 'membership'), 'value');
  const paths = field(membership, 'paths');
  const symbols = field(membership, 'symbols');
  if (version === 5 || version === 6) assert(!empty(paths) || (symbols !== undefined && !empty(symbols)), 'Component ' + id +
    ' has no membership paths or symbols. The producer needs at least one path or symbol for each component.');
  else assert(!empty(paths), 'Component ' + id + ' has no membership paths. The producer needs at least one path for each component.');
}

// The producer profile: what the producer writes, on top of the shared baseline
// rules. It writes formatVersion 1 to 6: a first version of a baseline, or a
// next version that a decision record makes. The baseline has at least one
// component. Each component, also a parent that only groups other components,
// has a purpose, a grouping reason and at least one path, or in version 5 at least
// one path or symbol. A question or gap does not replace these values. The profile
// runs first, so that each case has its own message.
function checkProducerProfile(baseline: unknown, made: VersionDecisions | undefined): void {
  const version = field(baseline, 'formatVersion');
  assert(oneOf(producerVersions, version), 'The producer writes baseline formatVersion 1, 2, 3, 4, 5 or 6, not ' +
    JSON.stringify(version) + '.');
  checkParent(baseline, made);
  const components = field(baseline, 'components');
  if (!Array.isArray(components)) return;
  assert(components.length > 0, 'The baseline has no components. The producer needs at least one component.');
  for (const component of components as unknown[]) {
    const id = String(field(component, 'id'));
    assert(field(field(component, 'purpose'), 'value') !== null,
      'Component ' + id + ' has no purpose. The producer needs a purpose for each component.');
    assert(field(field(component, 'groupingReason'), 'value') !== null,
      'Component ' + id + ' has no grouping reason. The producer needs a grouping reason for each component.');
    checkMembershipSelectors(component, id, version);
  }
}

// A symbol has one direct owner: two components cannot name the same symbol of a file.
function checkSymbolOwners(baseline: Baseline): void {
  if (!supportsSymbolSelectors(baseline)) return;
  const owners = new Map<string, string>();
  for (const { id, membership } of baseline.components) {
    for (const { path, symbol } of membership.value.symbols ?? []) {
      const key = JSON.stringify([path, symbol]);
      const owner = owners.get(key);
      assert(owner === undefined, `The symbol ${symbol} of ${path} has two owners: ${owner} and ${id}. A symbol has one direct owner.`);
      owners.set(key, id);
    }
  }
}

// The first problem that the shared rules found: its path, the item that it is in, and the rule.
function sharedRuleMessage(baseline: unknown, issue: { path: PropertyKey[]; message: string } | undefined): string {
  if (!issue) return 'The baseline does not match the shared baseline rules.';
  const path = issue.path.map(String).join('.');
  const [collection, index] = issue.path;
  const kind = itemKinds.get(collection);
  const id = kind === undefined || typeof index !== 'number' ? undefined : field(field(field(baseline, String(collection)), String(index)), 'id');
  const item = typeof id === 'string' ? ' (' + kind + ' ' + id + ')' : '';
  return path ? 'The baseline is invalid at ' + path + item + ': ' + issue.message : 'The baseline is invalid: ' + issue.message;
}

// The facts of a documentation statement that can be null, with their subjects.
// Each interaction fact has its own subject; an example cannot be null.
function nullableFacts(path: string, { part, statement }: DocumentationStatement): [string, unknown][] {
  if (part === 'example') return [];
  if (part === 'interaction' && object(statement.value))
    return Object.entries(statement.value).map(([key, fact]) => [path + '.' + key, fact]);
  return [[path, statement.value]];
}

// Each statement of an interface's documentation, in the order of the documentation.
function documentationChecks(itemId: string, documentation: BaselineDocumentation): DocumentationCheck[] {
  return documentationStatements(documentation).map(item => {
    const path = itemId + '.' + item.field;
    return { path, statement: item.statement, facts: nullableFacts(path, item) };
  });
}

// Fresh intent stays proposed. The v6 publication gate verifies every inherited statement against its frozen reference.
function checkProposedIntent(baseline: Baseline): void {
  for (const { itemId, field, statement } of baselineStatements(baseline))
    assert(statement.status === 'proposed' || (baseline.formatVersion === 6 && baseline.boundaryReview.identity.referenceDigest), 'Only proposed intent is supported: ' + itemId + '.' + field);
}

// The ID of a next version is reserved as the ID of a first version is: no item can use it.
function checkVersionId(baseline: Baseline): void {
  for (const key of collectionKeys)
    assert(!items(baseline, key).some(item => item.id === baseline.id), 'The ID ' + baseline.id + ' of the version is also the ID ' +
      'of the ' + itemKinds.get(key) + ' ' + baseline.id + '. The baseline ID is reserved. Use another decision record ID.');
}

// A person accepts the statements of a next version. The version names its
// decision record, and the run folder holds that record with the SHA-256 that
// the version record gives. Each accepted statement names that record in its
// acceptanceRef, and the record has an entry for it: accept, or correct with the
// value of the statement as its new value. A proposed statement needs no entry.
function checkDecidedStatements(baseline: Baseline, { link, saved }: VersionDecisions): void {
  assert(saved.sha256 === link.sha256, 'The decision record ' + link.path + ' changed after the version was made: its SHA-256 is ' +
    saved.sha256 + ', but the version record gives ' + link.sha256 + '.');
  checkVersionId(baseline);
  const entries = new Map(saved.decisions.entries.map(entry => [entry.itemId + '.' + entry.field, entry]));
  for (const { itemId, field, statement } of baselineStatements(baseline)) {
    if (statement.status === 'proposed') continue;
    const name = itemId + '.' + field;
    assert(statement.acceptanceRef === link.id, name + ' is accepted with the acceptanceRef ' + statement.acceptanceRef +
      ', but the version is made from the decision record ' + link.path + '.');
    const entry = entries.get(name);
    assert(entry, name + ' is accepted, but the decision record ' + link.path + ' has no entry for it.');
    assert(entry.action === 'accept' || isDeepStrictEqual(entry.newValue, statement.value),
      name + ' is accepted, but its value is not the new value of its correction in ' + link.path + '.');
  }
}

// The viewer display limits: 500 records, 2,000 explicit links and 16 component levels.
function checkDisplayLimits(baseline: Baseline): void {
  assert(collectionKeys.reduce((sum, key) => sum + baseline[key].length, 0) <= 500,
    'Baseline exceeds the 500-record display limit.');
  const links = baseline.interfaces.reduce((sum, item) => sum + Number(item.owner.value !== null) +
    (item.allowedConsumers.value?.length ?? 0), 0) + baseline.resources.filter(item => item.owner.value !== null).length;
  assert(links <= 2000, 'Baseline exceeds the 2,000-link display limit.');
  const parents = new Map(baseline.components.map(item => [item.id, item.parent?.value ?? null]));
  for (const component of baseline.components) {
    let levels = 1;
    for (let parent = parents.get(component.id); parent; parent = parents.get(parent))
      assert(++levels <= 16, 'Baseline exceeds the 16-parent-level display limit.');
  }
}

// The baseline document: the producer profile first, then the shared baseline
// rules, then the producer rules that need a valid shape. Without `made`, the
// document is a first version, which Stages 4 to 6 publish. With `made`, it is
// the next version that the decision record of `made` makes.
export function checkBaselineDocument(value: unknown, made?: VersionDecisions): Baseline {
  checkProducerProfile(value, made);
  const result = baselineSchema.safeParse(value);
  if (!result.success) throw new Error(sharedRuleMessage(value, result.error.issues[0]));
  checkSymbolOwners(result.data);
  if (made === undefined) checkProposedIntent(result.data);
  else checkDecidedStatements(result.data, made);
  checkDisplayLimits(result.data);
  return result.data;
}

// The run checks of the baseline items: model IDs, resolved evidence, and a
// question or gap for each unknown value.
export function validateBaseline({ baseline, discovery, claim, evidence }: BaselineInputs): BaselineMembers {
  const issues = [...(discovery.questions as Fields[]), ...(discovery.gaps as Fields[])];
  const unknown = (id: unknown): boolean => issues
    .some(issue => (issue.subjectRefs as string[]).some(ref => ref === id || ref.startsWith(id + '.')));
  const members = new Map<unknown, Fields>();
  for (const key of collectionKeys) {
    for (const item of items(baseline, key)) {
      claim(item.id);
      for (const name of itemStatementFields[key]) {
        const statement = item[name] as StatementState | undefined;
        if (statement === undefined) continue;
        evidence(statement);
        if (statement.value === null)
          assert(name === 'parent' || unknown(item.id), 'Unexplained unknown intent: ' + item.id + '.' + name);
      }
      const promises = statementValue(item, 'promises');
      if (object(promises)) assert(Object.values(promises).every(value => value !== null || unknown(item.id)),
        'Invalid interface promises: ' + item.id);
      if (key === 'components') members.set(item.id, item.membership as Fields);
    }
  }
  return { componentIds: new Set(baseline.components.map(item => item.id)), members };
}

function checkInterfaceDocumentation(item: BaselineInterface, documentation: BaselineDocumentation,
  inputs: DocumentationInputs, checks: { unknowns: Set<unknown>; reviewed: Set<unknown> }): void {
  for (const { path, statement, facts } of documentationChecks(item.id, documentation)) {
    inputs.evidence(statement);
    assert(facts.every(([subject, value]) => value !== null || checks.unknowns.has(subject)),
      'Invalid or unexplained documentation fact: ' + path);
  }
  const located = new Set<unknown>();
  for (const note of documentation.sourceNotes) {
    if (!note.location) continue;
    validateSourceLocation(note, inputs.source);
    located.add(note.evidenceRef);
  }
  for (const entry of documentation.entries)
    for (const example of entry.examples)
      if (example.basis === 'source-reviewed')
        assert(example.content.evidenceRefs.some(ref => checks.reviewed.has(ref) && located.has(ref)),
          'Source-reviewed example needs its own reviewed range and location note: ' +
          item.id + '.documentation.entries.' + entry.id + '.examples.' + example.id);
}

// Documentation facts cite resolved evidence, and a source-reviewed example cites
// a located range that the selected review history read.
export function validateDocumentation(inputs: DocumentationInputs): void {
  const checks = { unknowns: issueSubjects(inputs.discovery), reviewed: new Set(inputs.reviewedRanges.map(record => record.id)) };
  for (const item of inputs.baseline.interfaces as BaselineInterface[])
    if (item.documentation) checkInterfaceDocumentation(item, item.documentation, inputs, checks);
}

interface UsageChecks extends RunBaselineInputs { unknowns: Set<unknown>; reviewed: Set<unknown> }

function checkSourceUse(use: BaselineSourceUse, path: string, checks: UsageChecks): void {
  for (const ref of use.evidenceRefs) {
    assert(checks.source.records.has(ref), 'Source use requires a direct source record: ' + path + ': ' + ref);
    assert(checks.reviewed.has(ref), 'Source use is outside the selected source review history: ' + path + ': ' + ref);
  }
  checks.evidence(use);
  assert(checks.mapped.owns((checks.source.records.get(use.callerRef) as Fields).path, use.consumerId),
    'Source consumer differs from the direct mapped caller owner: ' + path);
  for (const name of ['consumerId', 'context'] as const) {
    if (name === 'consumerId' ? use.consumerId === null : use.context === 'unknown')
      assert(checks.unknowns.has(path + '.' + name), 'Missing exact discovery subject for unresolved source use: ' + path + '.' + name);
  }
}

// Source use belongs to the run snapshot and the selected mapping. Each use cites
// reviewed source records, and its consumer is the mapped owner of the caller.
export function validateSourceUsage(inputs: RunBaselineInputs): void {
  const { baseline, discovery, snapshotRef } = inputs;
  if (!supportsSourceUsage(baseline) || !baseline.sourceUsage) return;
  const usage = baseline.sourceUsage;
  assert(usage.snapshotRef === snapshotRef, 'sourceUsage.snapshotRef differs from the run snapshot.');
  assert(usage.mappingRef === discovery.codeMappingRef, 'sourceUsage.mappingRef differs from the selected candidate mapping.');
  const checks: UsageChecks = { ...inputs, unknowns: issueSubjects(discovery),
    reviewed: new Set(inputs.reviewedRanges.map(record => record.id)) };
  for (const assessment of usage.assessments) {
    inputs.evidence(assessment);
    for (const use of assessment.uses) checkSourceUse(use, assessment.interfaceId + '.sourceUsage.uses.' + use.id, checks);
    for (const note of assessment.sourceNotes) if (note.location) validateSourceLocation(note, inputs.source);
  }
}

// System entries belong to the run snapshot and the selected mapping, and each
// entry names the mapped owner of its file.
export function validateSystemEntryPoints(inputs: RunBaselineInputs): void {
  const { baseline, discovery, snapshotRef } = inputs;
  if (!supportsSystemEntryPoints(baseline) || !baseline.systemEntryPoints) return;
  const assessment = baseline.systemEntryPoints;
  assert(assessment.snapshotRef === snapshotRef, 'systemEntryPoints.snapshotRef differs from the run snapshot.');
  assert(assessment.mappingRef === discovery.codeMappingRef,
    'systemEntryPoints.mappingRef differs from the selected candidate mapping.');
  inputs.evidence(assessment);
  for (const entry of assessment.entries) {
    assert(inputs.mapped.owns(entry.path, entry.componentId), 'System entry differs from the direct mapped owner: ' + entry.id);
    inputs.evidence(entry);
    if (entry.source) validateSourceLocation(entry.source, inputs.source);
  }
}
