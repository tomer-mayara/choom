import { assert, boundedText, exact, type Fields, fields, list, object, oneOf, plainId, safe, strings, text } from './record-checks.ts';
import { type SourceRecords, validateSourceLocation } from './record-sources.ts';

// The checks of the proposed baseline against the producer profile, the viewer
// limits and the saved run records: the discovery result, the evidence registry,
// the saved source ranges and the selected code mapping.
export const collectionKeys = ['components', 'interfaces', 'resources', 'rules'] as const;

export interface BaselineInputs {
  baseline: Fields;
  discovery: Fields;
  claim(id: unknown): void;
  evidence(record: unknown): void;
}
export interface BaselineMembers { componentIds: Set<unknown>; members: Map<unknown, Fields> }
export interface DocumentationInputs {
  baseline: Fields;
  discovery: Fields;
  evidence(record: unknown): void;
  source: SourceRecords;
  reviewedRanges: Fields[];
}
export interface RunBaselineInputs extends DocumentationInputs {
  snapshotRef: string;
  componentIds: Set<unknown>;
  mapped: Map<unknown, unknown>;
}
interface ItemChecks {
  componentIds: Set<unknown>;
  unknown(id: unknown): boolean;
  evidence(record: unknown): void;
}

const producerVersions = [1, 2, 3, 4];
// Reads value?.[key] from an unchecked value.
const field = (value: unknown, key: string): unknown => (value as Fields | null | undefined)?.[key];
const statementValue = (item: Fields, name: string): unknown => (item[name] as Fields | undefined)?.value;

// The producer profile: what the producer writes, on top of the shared baseline
// rules. It writes formatVersion 1 to 4 and only the first version of a
// baseline. The baseline has at least one component. Each component, also a
// parent that only groups other components, has a purpose, a grouping reason
// and at least one path. A question or gap does not replace these values. The
// profile runs first, so that each case has its own message.
export function checkProducerProfile(baseline: unknown): void {
  const version = field(baseline, 'formatVersion');
  assert(oneOf(producerVersions, version), 'The producer writes baseline formatVersion 1, 2, 3 or 4, not ' + JSON.stringify(version) + '.');
  assert(field(baseline, 'parentId') === null, 'Expected a first proposed baseline.');
  const components = field(baseline, 'components');
  if (!Array.isArray(components)) return;
  assert(components.length > 0, 'The baseline has no components. The producer needs at least one component.');
  for (const component of components as unknown[]) {
    const id = String(field(component, 'id'));
    assert(field(field(component, 'purpose'), 'value') !== null,
      'Component ' + id + ' has no purpose. The producer needs a purpose for each component.');
    assert(field(field(component, 'groupingReason'), 'value') !== null,
      'Component ' + id + ' has no grouping reason. The producer needs a grouping reason for each component.');
    const paths = field(field(field(component, 'membership'), 'value'), 'paths');
    assert(!Array.isArray(paths) || paths.length > 0,
      'Component ' + id + ' has no membership paths. The producer needs at least one path for each component.');
  }
}
const absent = (value: unknown): boolean => value === null || value === undefined;
const issueSubjects = (discovery: Fields): Set<unknown> => new Set([...(discovery.questions as Fields[]),
  ...(discovery.gaps as Fields[])].flatMap(issue => issue.subjectRefs as unknown[]));

function validateDisplayLimits(baseline: Fields): void {
  assert(collectionKeys.reduce((sum, key) => sum + list(baseline[key], key).length, 0) <= 500,
    'Baseline exceeds the 500-record display limit.');
  const links = (baseline.interfaces as Fields[]).reduce((sum, item) => sum + Number(!absent(statementValue(item, 'owner'))) +
    ((statementValue(item, 'allowedConsumers') as unknown[] | null | undefined)?.length ?? 0), 0) +
    (baseline.resources as Fields[]).filter(item => !absent(statementValue(item, 'owner'))).length;
  assert(links <= 2000, 'Baseline exceeds the 2,000-link display limit.');
}

function selector(path: string): boolean {
  const base = path.endsWith('/**') ? path.slice(0, -3) : path;
  return safe(base) && !/^[A-Za-z]:/.test(base) && !/[?*[\]{}#]/.test(base);
}

function checkStatements(item: Fields, checks: ItemChecks): void {
  for (const [name, statement] of Object.entries(item)) {
    if (name === 'id' || name === 'name' || name === 'documentation') continue;
    assert(exact(statement, ['value', 'status', 'evidenceRefs']) && statement.status === 'proposed',
      'Only proposed intent is supported: ' + item.id + '.' + name);
    checks.evidence(statement);
    if (statement.value === null)
      assert(name === 'parent' || checks.unknown(item.id), 'Unexplained unknown intent: ' + item.id + '.' + name);
  }
}

function checkInterfaceIntent(item: Fields, checks: ItemChecks): void {
  const access = statementValue(item, 'publicAccess');
  if (!absent(access)) assert(strings(access), 'Invalid interface access points: ' + item.id);
  const consumers = statementValue(item, 'allowedConsumers');
  if (!absent(consumers)) assert(strings(consumers) && new Set(consumers).size === consumers.length &&
    consumers.every(id => checks.componentIds.has(id)), 'Invalid allowed consumers: ' + item.id);
  const promises = statementValue(item, 'promises');
  if (!absent(promises)) assert(exact(promises, ['behavior', 'data', 'errors', 'lifecycle']) &&
    Object.values(promises).every(value => text(value) || (value === null && checks.unknown(item.id))),
  'Invalid interface promises: ' + item.id);
}

function checkIntent(key: string, item: Fields, checks: ItemChecks): void {
  const owner = statementValue(item, 'owner');
  if (!absent(owner)) assert(checks.componentIds.has(owner), 'Unknown proposed owner: ' + item.id);
  if (key === 'interfaces') checkInterfaceIntent(item, checks);
  if (key === 'resources')
    for (const name of ['identity', 'accessRules'])
      assert(absent(statementValue(item, name)) || text(statementValue(item, name)), 'Invalid resource intent: ' + item.id + '.' + name);
  if (key === 'rules')
    for (const name of ['subject', 'expected', 'check'])
      assert(absent(statementValue(item, name)) || object(statementValue(item, name)), 'Invalid rule intent: ' + item.id + '.' + name);
}

function checkComponent(item: Fields, componentIds: Set<unknown>): unknown {
  assert(text(statementValue(item, 'purpose')) && text(statementValue(item, 'groupingReason')), 'Missing component intent: ' + item.id);
  const parent = statementValue(item, 'parent') ?? null;
  assert(parent === null || componentIds.has(parent), 'Unknown component parent: ' + item.id);
  const value = statementValue(item, 'membership') as Fields;
  assert(object(value) && strings(value.paths) && value.paths.every(selector) &&
    (!Object.hasOwn(value, 'excludePaths') || (Array.isArray(value.excludePaths) &&
      value.excludePaths.every(path => text(path) && selector(path)))) &&
    Object.keys(value).every(name => ['paths', 'excludePaths'].includes(name)),
  'Unsupported membership selectors: ' + item.id);
  return parent;
}

function checkParentLevels(componentIds: Set<unknown>, parents: Map<unknown, unknown>): void {
  for (const id of componentIds) {
    const ancestors = new Set([id]);
    for (let parent = parents.get(id); parent !== null; parent = parents.get(parent)) {
      assert(!ancestors.has(parent), 'Component parent cycle: ' + id);
      ancestors.add(parent);
      assert(ancestors.size <= 16, 'Baseline exceeds the 16-parent-level display limit.');
    }
  }
}

function itemKeys(key: string, item: Fields, baseline: Fields): string[] {
  const required: Record<string, string[]> = {
    components: ['id', 'name', 'purpose', 'membership', 'groupingReason'],
    interfaces: ['id', 'name', 'owner', 'publicAccess', 'allowedConsumers', 'promises'],
    resources: ['id', 'name', 'identity', 'owner', 'accessRules'],
    rules: ['id', 'name', 'subject', 'expected', 'check'],
  };
  return [...(required[key] as string[]),
    ...(key === 'components' && Object.hasOwn(item, 'parent') ? ['parent'] : []),
    ...(key === 'interfaces' && oneOf([2, 3, 4], baseline.formatVersion) && Object.hasOwn(item, 'documentation') ? ['documentation'] : [])];
}

export function validateBaseline({ baseline, discovery, claim, evidence }: BaselineInputs): BaselineMembers {
  checkProducerProfile(baseline);
  const keys = ['formatVersion', 'id', 'parentId', ...collectionKeys,
    ...(oneOf([3, 4], baseline?.formatVersion) && Object.hasOwn(baseline, 'sourceUsage') ? ['sourceUsage'] : []),
    ...(baseline?.formatVersion === 4 && Object.hasOwn(baseline, 'systemEntryPoints') ? ['systemEntryPoints'] : [])];
  assert(exact(baseline, keys) && oneOf([1, 2, 3, 4], baseline.formatVersion) &&
    plainId(baseline.id) && baseline.parentId === null, 'Expected a first proposed baseline.');
  validateDisplayLimits(baseline);
  const componentIds = new Set((list(baseline.components, 'components') as Fields[]).map(item => item.id));
  assert(componentIds.size > 0 && componentIds.size === (baseline.components as unknown[]).length, 'Missing or duplicate components.');
  const issues = [...(discovery.questions as Fields[]), ...(discovery.gaps as Fields[])];
  const unknown = (id: unknown): boolean => issues
    .some(issue => (issue.subjectRefs as string[]).some(ref => ref === id || ref.startsWith(id + '.')));
  const checks: ItemChecks = { componentIds, unknown, evidence };
  const parents = new Map<unknown, unknown>();
  const members = new Map<unknown, Fields>();
  for (const key of collectionKeys) {
    for (const item of list(baseline[key], key) as Fields[]) {
      assert(exact(item, itemKeys(key, item, baseline)) && plainId(item.id) && text(item.name), 'Invalid baseline item: ' + item?.id);
      claim(item.id);
      checkStatements(item, checks);
      checkIntent(key, item, checks);
      if (key !== 'components') continue;
      parents.set(item.id, checkComponent(item, componentIds));
      members.set(item.id, item.membership as Fields);
    }
  }
  checkParentLevels(componentIds, parents);
  return { componentIds, members };
}

interface DocumentationChecks {
  unknowns: Set<unknown>;
  reviewed: Set<unknown>;
  evidence(record: unknown): void;
  source: SourceRecords;
}
type FactCheck = (value: unknown, path: string) => boolean;
interface InterfaceDocumentation {
  checks: DocumentationChecks;
  item: Fields;
  nullableText: FactCheck;
  statement(record: unknown, path: string, valid: FactCheck): unknown;
  reviewedExamples: { example: Fields; subject: string }[];
}

function checkExample(example: Fields, subject: string, exampleIds: Set<unknown>, documentation: InterfaceDocumentation): void {
  assert(exact(example, ['id', 'name', 'basis', 'content']) && plainId(example.id) && boundedText(example.id, 4096) &&
    !exampleIds.has(example.id) && boundedText(example.name) && oneOf(['illustrative', 'source-reviewed'], example.basis),
  'Invalid documented example: ' + subject);
  exampleIds.add(example.id);
  documentation.statement(example.content, subject + '.content', value => {
    const content = value as Fields;
    const result = content?.result as Fields;
    return fields(content, ['text'], ['input', 'result']) && boundedText(content.text, 16384) &&
      (!Object.hasOwn(content, 'input') || boundedText(content.input, 16384)) &&
      (!Object.hasOwn(content, 'result') || (exact(result, ['text', 'summary', 'scope']) &&
        boundedText(result.text, 16384) && boundedText(result.summary) && oneOf(['complete', 'excerpt'], result.scope)));
  });
  if (example.basis === 'source-reviewed') documentation.reviewedExamples.push({ example, subject });
}

function checkEntry(entry: Fields, entryIds: Set<unknown>, documentation: InterfaceDocumentation): void {
  const { item, nullableText, statement } = documentation;
  const path = item.id + '.documentation.entries.' + entry?.id;
  assert(fields(entry, ['id', 'name', 'accessPoint', 'kind', 'description', 'examples'], ['interaction', 'signature']) &&
    plainId(entry.id) && boundedText(entry.id, 4096) && !entryIds.has(entry.id) && boundedText(entry.name) &&
    boundedText(entry.accessPoint, 4096) && (statementValue(item, 'publicAccess') as unknown[] | null | undefined)?.includes(entry.accessPoint) &&
    Array.isArray(entry.examples) && entry.examples.length <= 8, 'Invalid documentation entry: ' + path);
  entryIds.add(entry.id);
  const kind = statement(entry.kind, path + '.kind', (value, subject) => value === null ? documentation.checks.unknowns.has(subject) :
    oneOf(['function', 'command', 'type', 'data', 'message', 'workflow'], value));
  statement(entry.description, path + '.description', nullableText);
  if (Object.hasOwn(entry, 'signature')) {
    assert(kind === 'function', 'Signature requires a function or method entry: ' + path);
    statement(entry.signature, path + '.signature', nullableText);
  }
  if (Object.hasOwn(entry, 'interaction')) {
    assert(oneOf(['function', 'command', 'workflow'], kind), 'Interaction requires a callable or workflow entry: ' + path);
    statement(entry.interaction, path + '.interaction', (value, subject) =>
      exact(value, ['input', 'success', 'failures', 'effects']) &&
      Object.entries(value).every(([key, fact]) => nullableText(fact, subject + '.' + key)));
  }
  const exampleIds = new Set<unknown>();
  for (const example of entry.examples as Fields[]) checkExample(example, path + '.examples.' + example?.id, exampleIds, documentation);
}

function checkSourceNotes(doc: Fields, citations: Set<unknown>, documentation: InterfaceDocumentation): Set<unknown> {
  const located = new Set<unknown>();
  const notes = new Set<unknown>();
  for (const note of doc.sourceNotes as Fields[]) {
    assert(fields(note, ['evidenceRef', 'description'], ['location']) && boundedText(note.evidenceRef, 4096) &&
      citations.has(note.evidenceRef) && !notes.has(note.evidenceRef) && boundedText(note.description),
    'Invalid source note: ' + documentation.item.id);
    notes.add(note.evidenceRef);
    if (!Object.hasOwn(note, 'location')) continue;
    validateSourceLocation(note, documentation.checks.source);
    located.add(note.evidenceRef);
  }
  return located;
}

function checkInterfaceDocumentation(item: Fields, checks: DocumentationChecks): void {
  const citations = new Set<unknown>();
  const nullableText: FactCheck = (value, path) => value === null ? checks.unknowns.has(path) : boundedText(value);
  function statement(record: unknown, path: string, valid: FactCheck): unknown {
    assert(exact(record, ['value', 'status', 'evidenceRefs']) && record.status === 'proposed' &&
      strings(record.evidenceRefs) && record.evidenceRefs.every(ref => boundedText(ref, 4096)), 'Invalid proposed documentation statement: ' + path);
    checks.evidence(record);
    record.evidenceRefs.forEach(ref => citations.add(ref));
    assert(valid(record.value, path), 'Invalid or unexplained documentation fact: ' + path);
    return record.value;
  }
  for (const name of ['owner', 'publicAccess', 'allowedConsumers', 'promises'])
    ((item[name] as Fields | undefined)?.evidenceRefs as unknown[] | undefined)?.forEach(ref => citations.add(ref));
  const doc = item.documentation;
  assert(exact(doc, ['summary', 'entries', 'sourceNotes']) && Array.isArray(doc.entries) &&
    doc.entries.length <= 32 && Array.isArray(doc.sourceNotes), 'Invalid interface documentation: ' + item.id);
  const documentation: InterfaceDocumentation = { checks, item, nullableText, statement, reviewedExamples: [] };
  statement(doc.summary, item.id + '.documentation.summary', nullableText);
  const entryIds = new Set<unknown>();
  for (const entry of doc.entries as Fields[]) checkEntry(entry, entryIds, documentation);
  const located = checkSourceNotes(doc, citations, documentation);
  for (const { example, subject } of documentation.reviewedExamples)
    assert(((example.content as Fields).evidenceRefs as unknown[]).some(ref => checks.reviewed.has(ref) && located.has(ref)),
      'Source-reviewed example needs its own reviewed range and location note: ' + subject);
}

export function validateDocumentation({ baseline, discovery, evidence, source, reviewedRanges }: DocumentationInputs): void {
  const documents = (baseline.interfaces as Fields[]).filter(item => Object.hasOwn(item, 'documentation'));
  assert(Buffer.byteLength(JSON.stringify(documents.map(item => item.documentation)), 'utf8') <= 2 * 1024 * 1024,
    'Interface documentation exceeds the 2 MiB byte limit.');
  const checks: DocumentationChecks = { unknowns: issueSubjects(discovery), reviewed: new Set(reviewedRanges.map(record => record.id)),
    evidence, source };
  for (const item of documents) checkInterfaceDocumentation(item, checks);
}

interface UsageChecks extends RunBaselineInputs {
  interfaces: Map<unknown, Fields>;
  unknowns: Set<unknown>;
  reviewed: Set<unknown>;
  usage: Fields;
}
const localId = (value: unknown): boolean => plainId(value) && boundedText(value, 4096);
const references = (value: unknown): boolean => strings(value) && new Set(value).size === value.length &&
  value.every(ref => boundedText(ref, 4096));

// The interface that an assessment describes, its documented entries, and the
// evidence that the assessment and its uses cite.
interface AssessedInterface { item: Fields; entries: Map<unknown, Fields>; citations: Set<unknown> }

function checkSourceUse(use: Fields, path: string, { item, entries, citations }: AssessedInterface, checks: UsageChecks): void {
  for (const ref of use.evidenceRefs as string[]) {
    assert(!ref.includes('#') && checks.source.records.has(ref), 'Source use requires a direct source record: ' + path + ': ' + ref);
    assert(checks.reviewed.has(ref), 'Source use is outside the selected source review history: ' + path + ': ' + ref);
    citations.add(ref);
  }
  checks.evidence(use);
  assert(checks.mapped.get((checks.source.records.get(use.callerRef) as Fields).path) === use.consumerId,
    'Source consumer differs from the direct mapped caller owner: ' + path);
  for (const field of ['consumerId', 'context']) {
    if (field === 'consumerId' ? use.consumerId === null : use.context === 'unknown')
      assert(checks.unknowns.has(path + '.' + field), 'Missing exact discovery subject for unresolved source use: ' + path + '.' + field);
  }
  const access = statementValue(item, 'publicAccess') as unknown[] | null | undefined;
  if (Object.hasOwn(use, 'accessPoint'))
    assert(boundedText(use.accessPoint, 4096) && access?.includes(use.accessPoint), 'Unknown source-use access point: ' + path);
  if (Object.hasOwn(use, 'entryId'))
    assert(localId(use.entryId) && entries.has(use.entryId), 'Unknown source-use documentation entry: ' + path);
  if (Object.hasOwn(use, 'accessPoint') && Object.hasOwn(use, 'entryId'))
    assert((entries.get(use.entryId) as Fields).accessPoint === use.accessPoint, 'Conflicting source-use entry binding: ' + path);
}

function checkUseNotes(assessment: Fields, citations: Set<unknown>, checks: UsageChecks): void {
  const located = new Set<unknown>();
  const noteRefs = new Set<unknown>();
  for (const note of assessment.sourceNotes as Fields[]) {
    assert(fields(note, ['evidenceRef', 'description'], ['location']) && boundedText(note.evidenceRef, 4096) &&
      citations.has(note.evidenceRef) && !noteRefs.has(note.evidenceRef) && boundedText(note.description),
    'Invalid source-use note: ' + assessment.interfaceId);
    noteRefs.add(note.evidenceRef);
    if (!Object.hasOwn(note, 'location')) continue;
    validateSourceLocation(note, checks.source);
    assert((note.location as Fields).snapshotRef === checks.usage.snapshotRef,
      'Source-use note belongs to a different snapshot: ' + note.evidenceRef);
    located.add(note.evidenceRef);
  }
  for (const use of assessment.uses as Fields[])
    for (const ref of use.evidenceRefs as unknown[])
      assert(located.has(ref), 'Source use needs a located note for every evidence reference: ' + use.id + ': ' + ref);
}

function checkAssessment(assessment: Fields, checks: UsageChecks): void {
  const item = checks.interfaces.get(assessment.interfaceId) as Fields;
  const entries = new Map(((item.documentation as Fields | undefined)?.entries as Fields[] | undefined ?? [])
    .map(entry => [entry.id, entry]));
  const useIds = new Set<unknown>();
  const citations = new Set(assessment.evidenceRefs as unknown[]);
  for (const use of assessment.uses as Fields[]) {
    const path = assessment.interfaceId + '.sourceUsage.uses.' + use?.id;
    assert(fields(use, ['id', 'consumerId', 'kind', 'context', 'description', 'callerRef', 'evidenceRefs'], ['accessPoint', 'entryId']) &&
      localId(use.id) && !useIds.has(use.id) && (use.consumerId === null || (localId(use.consumerId) && checks.componentIds.has(use.consumerId))) &&
      oneOf(['value', 'type'], use.kind) && oneOf(['application', 'tooling', 'test', 'unknown'], use.context) &&
      boundedText(use.description) && boundedText(use.callerRef, 4096) && references(use.evidenceRefs) &&
      (use.evidenceRefs as unknown[]).includes(use.callerRef), 'Invalid source use: ' + path);
    useIds.add(use.id);
    checkSourceUse(use, path, { item, entries, citations }, checks);
  }
  checkUseNotes(assessment, citations, checks);
}

export function validateSourceUsage(inputs: RunBaselineInputs): void {
  const { baseline, discovery, snapshotRef } = inputs;
  if (!Object.hasOwn(baseline, 'sourceUsage')) return;
  const usage = baseline.sourceUsage as Fields;
  assert(oneOf([3, 4], baseline.formatVersion) && exact(usage, ['snapshotRef', 'mappingRef', 'assessments']) &&
    boundedText(usage.snapshotRef, 4096) && boundedText(usage.mappingRef, 4096) && Array.isArray(usage.assessments),
  'Invalid sourceUsage record.');
  assert(usage.snapshotRef === snapshotRef, 'sourceUsage.snapshotRef differs from the run snapshot.');
  assert(usage.mappingRef === discovery.codeMappingRef, 'sourceUsage.mappingRef differs from the selected candidate mapping.');
  assert(Buffer.byteLength(JSON.stringify(usage), 'utf8') <= 2 * 1024 * 1024,
    'sourceUsage exceeds the 2 MiB byte limit.');
  const checks: UsageChecks = { ...inputs, usage, unknowns: issueSubjects(discovery),
    interfaces: new Map((baseline.interfaces as Fields[]).map(item => [item.id, item])),
    reviewed: new Set(inputs.reviewedRanges.map(record => record.id)) };
  const assessed = new Set<unknown>();
  let uses = 0;
  let notes = 0;
  for (const assessment of usage.assessments as Fields[]) {
    assert(exact(assessment, ['interfaceId', 'scope', 'evidenceRefs', 'limitations', 'uses', 'sourceNotes']) &&
      localId(assessment.interfaceId) && checks.interfaces.has(assessment.interfaceId) && !assessed.has(assessment.interfaceId) &&
      boundedText(assessment.scope) && references(assessment.evidenceRefs) && Array.isArray(assessment.limitations) &&
      assessment.limitations.every(value => boundedText(value)) && Array.isArray(assessment.uses) && Array.isArray(assessment.sourceNotes),
    'Invalid or duplicate source-use assessment: ' + assessment?.interfaceId);
    assessed.add(assessment.interfaceId);
    uses += assessment.uses.length;
    notes += assessment.sourceNotes.length;
    assert(uses <= 2000, 'sourceUsage exceeds the 2,000-use limit.');
    assert(notes <= 4000, 'sourceUsage exceeds the 4,000-source-note limit.');
    inputs.evidence(assessment);
    checkAssessment(assessment, checks);
  }
}

function entryEvidence(record: Fields, evidence: (record: unknown) => void): void {
  assert(strings(record.evidenceRefs) && new Set(record.evidenceRefs).size === record.evidenceRefs.length &&
    record.evidenceRefs.every(ref => boundedText(ref, 4096)), 'Invalid system-entry evidence: ' + (record.id ?? 'scope'));
  evidence(record);
}

function checkSystemEntry(entry: Fields, ids: Set<unknown>, interfaces: Map<unknown, Fields>, inputs: RunBaselineInputs): void {
  assert(fields(entry, ['id', 'kind', 'label', 'path', 'componentId', 'evidenceRefs'], ['source', 'interfaceId', 'entryId']) &&
    localId(entry.id) && !ids.has(entry.id) && oneOf(['startup', 'external'], entry.kind) && boundedText(entry.label) &&
    boundedText(entry.path, 4096) && safe(entry.path) && !/^[A-Za-z]:/.test(entry.path) && localId(entry.componentId) &&
    inputs.componentIds.has(entry.componentId), 'Invalid or duplicate system entry: ' + entry?.id);
  ids.add(entry.id);
  assert(inputs.mapped.get(entry.path) === entry.componentId, 'System entry differs from the direct mapped owner: ' + entry.id);
  entryEvidence(entry, inputs.evidence);
  if (Object.hasOwn(entry, 'interfaceId'))
    assert(localId(entry.interfaceId) && interfaces.has(entry.interfaceId), 'Unknown system-entry interface: ' + entry.id);
  if (Object.hasOwn(entry, 'entryId'))
    assert(localId(entry.entryId) && ((interfaces.get(entry.interfaceId)?.documentation as Fields | undefined)?.entries as Fields[] | undefined)
      ?.some(item => item.id === entry.entryId), 'Unknown system-entry interface operation: ' + entry.id);
  if (Object.hasOwn(entry, 'source')) checkEntrySource(entry, inputs);
}

function checkEntrySource(entry: Fields, inputs: RunBaselineInputs): void {
  const located = entry.source as Fields;
  const location = located?.location as Fields | undefined;
  assert(exact(located, ['evidenceRef', 'location']) && boundedText(located.evidenceRef, 4096) &&
    !located.evidenceRef.includes('#') && (entry.evidenceRefs as unknown[]).includes(located.evidenceRef) &&
    location?.snapshotRef === inputs.snapshotRef && location.path === entry.path,
  'Invalid system-entry source: ' + entry.id);
  validateSourceLocation(located, inputs.source);
}

export function validateSystemEntryPoints(inputs: RunBaselineInputs): void {
  const { baseline, discovery, snapshotRef } = inputs;
  if (!Object.hasOwn(baseline, 'systemEntryPoints')) return;
  const assessment = baseline.systemEntryPoints as Fields;
  assert(exact(assessment, ['snapshotRef', 'mappingRef', 'scope', 'evidenceRefs', 'limitations', 'entries']) &&
    boundedText(assessment.snapshotRef, 4096) && boundedText(assessment.mappingRef, 4096) &&
    boundedText(assessment.scope) && Array.isArray(assessment.limitations) &&
    assessment.limitations.every(value => boundedText(value)) && Array.isArray(assessment.entries),
  'Invalid systemEntryPoints assessment.');
  assert(assessment.snapshotRef === snapshotRef, 'systemEntryPoints.snapshotRef differs from the run snapshot.');
  assert(assessment.mappingRef === discovery.codeMappingRef,
    'systemEntryPoints.mappingRef differs from the selected candidate mapping.');
  assert(assessment.entries.length <= 2000, 'systemEntryPoints exceeds the 2,000-entry limit.');
  assert(Buffer.byteLength(JSON.stringify(assessment), 'utf8') <= 2 * 1024 * 1024,
    'systemEntryPoints exceeds the 2 MiB byte limit.');
  entryEvidence(assessment, inputs.evidence);
  const interfaces = new Map((baseline.interfaces as Fields[]).map(item => [item.id, item]));
  const ids = new Set<unknown>();
  for (const entry of assessment.entries as Fields[]) checkSystemEntry(entry, ids, interfaces, inputs);
}
