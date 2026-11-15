import { isDeepStrictEqual as same } from 'node:util';
import type * as Yaml from 'yaml';
import { validateBaseline, validateDocumentation, validateSourceUsage, validateSystemEntryPoints } from './record-baseline.ts';
import { type Artifact, assert, exact, type Fields, json, list, object, oneOf, strings, text } from './record-checks.ts';
import { validateGraph } from './record-graph.ts';
import { type SourceRecords, sourcesFor } from './record-sources.ts';

// The shared record validator. Stages 4 and 5 check the working discovery
// records before they save drafts; Stage 6 also checks a readiness packet before
// it saves the fixed baseline and discovery result.
export const factKeys = ['entryAnalysisRef', 'codeMappingRef', 'dependenciesRef', 'resourceAccessRef'];
export const packetFiles = ['readiness.yaml', 'review-scope.json', 'llm/analysis-prompt.md',
  'llm/analysis-response.md', 'llm/analysis-call.yaml'];
const issueKeys = ['questions', 'gaps'] as const;
const yamlNodeLimit = 250000;

// The saved run manifest. The checks read only these fields.
export interface RunRecord { id: unknown; snapshot: { id: string; inventoryRef: string }; [field: string]: unknown }
export interface RecordInputs {
  run: RunRecord;
  discovery: unknown;
  baseline: unknown;
  inventory: Fields;
  artifacts: Map<string, Artifact>;
  parse(text: string): unknown;
  readSource(path: string, limit: number): Buffer;
  packet?: Map<string, Buffer>;
  draftDigests?: Record<string, string>;
  reservedIds?: readonly unknown[];
}
export type RecordCounts = Record<string, number>;
interface References {
  claim(id: unknown): void;
  resolve(ref: unknown): unknown;
  evidence(record: unknown): void;
  count(): number;
}
// The run, the selected fact records and the reference checks that every validation phase uses.
interface Selection extends References {
  inputs: RecordInputs;
  discovery: Fields;
  baseline: Fields;
  snapshotRef: string;
  indexed: Map<unknown, Fields>;
  document(id: unknown): unknown;
  source: SourceRecords;
  entry: Fields;
  mapping: Fields;
  graph: Fields;
  access: Fields;
}
interface History { historyRefs: unknown[]; reviewedRanges: Fields[] }

const structureLimit = (): never => { throw new Error('Baseline exceeds the YAML structure limit.'); };
const refuseProperties = (items: Yaml.CST.SourceToken[]): void => assert(!items.some(item => oneOf(['anchor', 'tag'], item.type)),
  'Baseline YAML anchors and explicit tags are unsupported.');

function checkLexerLimits(input: string, yaml: typeof Yaml): void {
  const lines = /\r\n|[\r\n]/gu;
  let lineCount = 0;
  while (lines.test(input)) if (++lineCount > yamlNodeLimit) structureLimit();
  let tokens = 0;
  let commas = 0;
  let scalar = false;
  for (const token of new yaml.Lexer().lex(input)) {
    assert(++tokens <= 1500000, 'Baseline exceeds the YAML token limit.');
    if (!scalar && token === ',' && ++commas > yamlNodeLimit) structureLimit();
    scalar = !scalar && token === yaml.CST.SCALAR;
  }
}

function checkFlowSeparators(token: Yaml.CST.FlowCollection): void {
  for (const [index, item] of token.items.entries()) {
    const separators = item.start.filter(part => part.type === 'comma').length;
    const empty = item.key === undefined && !item.sep && !item.value;
    assert(!(separators > 1 || (index === 0 && separators > 0) ||
      (index > 0 && !empty && separators === 0) || (empty && index < token.items.length - 1)),
    'Invalid baseline YAML flow separators.');
  }
}

// The structure of one YAML document within the node and depth limits, without
// aliases, anchors, tags or syntax errors.
function structureCheck(yaml: typeof Yaml): (token: Yaml.CST.Token | null | undefined, depth: number) => void {
  let nodes = 0;
  return function inspect(token, depth) {
    if (++nodes > yamlNodeLimit) structureLimit();
    assert(!oneOf(['alias', 'error'], token?.type), 'Baseline YAML aliases and syntax errors are unsupported.');
    if (!yaml.CST.isCollection(token)) {
      if (token?.type !== 'block-scalar' || depth > 0)
        yaml.CST.resolveAsScalar(token as Yaml.CST.FlowScalar, true, () => { throw new Error('Invalid baseline YAML scalar.'); });
      return;
    }
    if (depth >= 32) structureLimit();
    if (token.type === 'flow-collection') checkFlowSeparators(token);
    const sequence = token.type === 'block-seq' ||
      (token.type === 'flow-collection' && token.start.type === 'flow-seq-start');
    for (const { start, key, sep, value } of token.items as Yaml.CST.CollectionItem[]) {
      refuseProperties(start);
      if (sep) refuseProperties(sep);
      if (key === undefined && !value && !start.some(item => item.type === 'seq-item-ind')) continue;
      const implicitMap = sequence && key !== undefined;
      if (implicitMap && (depth + 1 >= 32 || ++nodes > yamlNodeLimit)) structureLimit();
      const nextDepth = depth + (implicitMap ? 2 : 1);
      if (!sequence || implicitMap) inspect(key, nextDepth);
      inspect(value, nextDepth);
    }
  };
}

function* checkedTokens(input: string, yaml: typeof Yaml): Generator<Yaml.CST.Token> {
  const inspect = structureCheck(yaml);
  let documents = 0;
  for (const token of new yaml.Parser().parse(input)) {
    assert(!oneOf(['directive', 'error'], token.type), 'Baseline YAML directives and syntax errors are unsupported.');
    if (token.type === 'document') {
      assert(++documents === 1, 'Baseline must contain one YAML document.');
      refuseProperties(token.start);
      inspect(token.value, 0);
    }
    yield token;
  }
  assert(documents === 1, 'Baseline must contain one YAML document.');
}

// The saved tools run outside the viewer. Keep its bounded YAML profile here too.
// The caller supplies the trusted, pinned YAML module; no saved run code is loaded.
export function readBaselineYaml(bytes: Buffer, yaml: typeof Yaml): unknown {
  assert(bytes.length <= 16 * 1024 * 1024, 'Baseline exceeds the 16 MiB file limit.');
  const input = bytes.toString('utf8');
  assert(Buffer.from(input).equals(bytes), 'Baseline must use UTF-8.');
  checkLexerLimits(input, yaml);
  const composer = new yaml.Composer({ schema: 'core', version: '1.2', strict: true, merge: false,
    resolveKnownTags: false, uniqueKeys: false, prettyErrors: false });
  const [document] = [...composer.compose(checkedTokens(input, yaml))];
  assert(document && !document.errors.length && !document.warnings.length, 'Baseline must contain valid YAML.');
  yaml.visit(document, {
    Map: (_key, map) => {
      const keys = new Set();
      for (const { key } of map.items) {
        assert(yaml.isScalar(key) && typeof key.value === 'string' && !keys.has(key.value),
          'Baseline YAML mapping keys must be unique strings.');
        keys.add(key.value);
      }
    },
    Scalar: (_key, { value }) => assert(value === null || oneOf(['string', 'boolean'], typeof value) ||
      (typeof value === 'number' && Number.isFinite(value)), 'Baseline must contain JSON-compatible data.'),
  });
  return document.toJS({ maxAliasCount: 0 });
}

function documentReader(artifacts: Map<string, Artifact>, parse: (text: string) => unknown): (id: unknown) => unknown {
  const documents = new Map<unknown, unknown>();
  return function document(id) {
    const artifact = artifacts.get(id as string);
    assert(artifact, 'Unknown artifact: ' + id);
    if (!documents.has(id))
      documents.set(id, /\.ya?ml$/.test(artifact.path) ? parse(artifact.bytes.toString('utf8')) : json(artifact.bytes));
    return documents.get(id);
  };
}

// Model IDs must not collide with artifact IDs, source-range IDs or other model
// IDs, and evidence references must resolve against the saved records.
function references(artifacts: Map<string, Artifact>, source: SourceRecords, document: (id: unknown) => unknown): References {
  const occupied = new Set<unknown>([...artifacts.keys(), ...source.records.keys()]);
  let refs = 0;
  function claim(id: unknown): void {
    assert(text(id) && !occupied.has(id), 'Invalid or colliding model ID: ' + id);
    occupied.add(id);
  }
  function resolve(ref: unknown): unknown {
    assert(text(ref), 'Empty evidence reference.');
    const split = ref.indexOf('#');
    const base = split < 0 ? ref : ref.slice(0, split);
    const record = source.records.get(base);
    assert(artifacts.has(base) || record, 'Unknown evidence: ' + ref);
    refs++;
    if (record) source.verify(record);
    if (split < 0) return record;
    const pointer = decodeURIComponent(ref.slice(split + 1));
    assert(pointer === '' || pointer.startsWith('/'), 'Invalid JSON Pointer: ' + ref);
    let value: unknown = record ?? document(base);
    for (const part of pointer === '' ? [] : pointer.slice(1).split('/')) {
      const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
      assert(!/~(?:[^01]|$)/.test(part) && value !== null && typeof value === 'object' &&
        (!Array.isArray(value) || /^(0|[1-9][0-9]*)$/.test(key)) && Object.hasOwn(value, key), 'Unresolved evidence: ' + ref);
      value = (value as Fields)[key];
    }
    return value;
  }
  function evidence(record: unknown): void {
    const fields = record as Fields;
    assert(strings(fields.evidenceRefs), 'Missing evidence for ' + (fields.id ?? 'record'));
    fields.evidenceRefs.forEach(resolve);
  }
  return { claim, resolve, evidence, count: () => refs };
}

function checkWorkingDiscovery(discovery: unknown, run: RunRecord): asserts discovery is Fields {
  const working = discovery as Fields | null | undefined;
  assert(working?.formatVersion === 1 && working.kind === 'architecture-discovery' && working.runRef === run.id &&
    !Object.hasOwn(working, 'baselineRef') && exact(working.overview, ['text', 'evidenceRefs']) && text(working.overview.text),
  'Expected complete working discovery with no fixed baseline reference.');
  assert(exact(working, ['formatVersion', 'kind', 'runRef', ...factKeys, 'overview', 'inspectedPaths', ...issueKeys]),
    'Unexpected working discovery fields.');
}

function select(inputs: RecordInputs): Selection {
  const { run, artifacts, inventory, readSource } = inputs;
  const discovery = inputs.discovery;
  const snapshotRef = run.snapshot.id;
  checkWorkingDiscovery(discovery, run);
  const indexed = new Map((inventory.files as Fields[]).map(file => [file.path, file]));
  const document = documentReader(artifacts, inputs.parse);
  const [entry, mapping, graph, access] = factKeys.map(key => document(discovery[key]) as Fields) as [Fields, Fields, Fields, Fields];
  assert([entry, mapping, graph, access].every(record => record.formatVersion === 1 && record.snapshotRef === snapshotRef),
    'A selected fact belongs to a different snapshot.');
  const source = sourcesFor({ artifacts, document, snapshotRef, inventory, readSource });
  const refs = references(artifacts, source, document);
  (inputs.reservedIds ?? []).forEach(refs.claim);
  return { ...refs, inputs, discovery, baseline: inputs.baseline as Fields, snapshotRef, indexed, document, source,
    entry, mapping, graph, access };
}

function checkIssues({ discovery, entry, claim, evidence }: Selection): void {
  for (const kind of issueKeys) {
    assert(same(list(discovery[kind], kind), entry[kind]), 'Selected entry and discovery issues differ: ' + kind);
    for (const issue of discovery[kind] as Fields[]) {
      claim(issue.id);
      assert(strings(issue.subjectRefs) && (kind === 'questions' ? text(issue.text) : text(issue.reason) && text(issue.kind)),
        'Invalid ' + kind + ': ' + issue.id);
      evidence(issue);
    }
  }
}

function selectedHistory({ discovery, document, snapshotRef, source }: Selection): History {
  const chain: { ref: unknown; record: Fields }[] = [];
  const histories = new Set<unknown>();
  for (let ref: unknown = discovery.entryAnalysisRef; ref !== undefined;) {
    assert(text(ref) && !histories.has(ref), 'Invalid selected entry-analysis history.');
    histories.add(ref);
    const record = document(ref) as Fields;
    assert(record.formatVersion === 1 && record.kind === 'entry-analysis' && record.snapshotRef === snapshotRef &&
      record.llmReview === 'recorded' && Array.isArray(record.reviewedFiles), 'Invalid historical entry analysis: ' + ref);
    chain.push({ ref, record });
    record.reviewedFiles.forEach(reviewed => source.verify(reviewed as Fields));
    for (const kind of issueKeys) {
      const current = new Map((discovery[kind] as Fields[]).map(item => [item.id, item]));
      for (const issue of list(record[kind], kind) as Fields[])
        assert(same(current.get(issue.id), issue), 'Earlier issue differs from selected history: ' + issue.id);
    }
    ref = record.previousEntryAnalysisRef;
  }
  return { historyRefs: chain.slice(1).map(item => item.ref),
    reviewedRanges: chain.flatMap(item => item.record.reviewedFiles as Fields[]) };
}

const matchesSelector = (path: string, selector: string): boolean =>
  selector.endsWith('/**') ? path.startsWith(selector.slice(0, -2)) : path === selector;

function checkMapping(selection: Selection, members: Map<unknown, Fields>, { historyRefs, reviewedRanges }: History): Map<unknown, unknown> {
  const { mapping, discovery, indexed, claim, resolve, evidence } = selection;
  const scope = mapping.scope as Fields | undefined;
  assert(mapping.kind === 'code-mapping' && scope?.inventoryRef === selection.inputs.run.snapshot.inventoryRef &&
    scope.basis === 'all-inventoried-regular-files' && scope.unitKind === 'file' &&
    text(scope.inspectionMeaning) && scope.selectedEntryAnalysisRef === discovery.entryAnalysisRef &&
    same(scope.historicalEntryAnalysisRefs, historyRefs) && strings(mapping.limits) &&
    Array.isArray(mapping.units) && mapping.units.length === indexed.size, 'Invalid selected code mapping scope.');
  const reviewedPaths = new Set(reviewedRanges.map(item => item.path));
  const mapped = new Map<unknown, unknown>();
  for (const unit of mapping.units as Fields[]) {
    claim(unit.id);
    assert(!mapped.has(unit.path) && indexed.has(unit.path) && indexed.get(unit.path)?.sha256 === unit.sha256 && strings(unit.roles) &&
      text(unit.reason) && unit.inspection === (reviewedPaths.has(unit.path) ? 'reviewed' : 'unreviewed'),
    'Invalid mapped unit or inspection coverage: ' + unit.path);
    const path = unit.path as string;
    const owners = [...members].filter(([, { value }]) => {
      const { paths, excludePaths } = value as { paths: string[]; excludePaths?: string[] };
      return paths.some(pattern => matchesSelector(path, pattern)) && !(excludePaths ?? []).some(pattern => matchesSelector(path, pattern));
    }).map(([id]) => id);
    assert(same(owners, unit.owner === null ? [] : [unit.owner]), 'Mapping and direct membership differ: ' + unit.path);
    if (unit.owner === null) assert(unit.membershipRef === null, 'Unknown unit selects a membership: ' + unit.path);
    else {
      const selectedMembership = resolve(unit.membershipRef);
      const membership = members.get(unit.owner) as Fields;
      assert(same(selectedMembership, membership) || same(selectedMembership, membership.value),
        'Mapped membership reference differs from proposed intent: ' + unit.path);
    }
    evidence(unit);
    mapped.set(unit.path, unit.owner);
  }
  return mapped;
}

// The retained Knip receipts, the reuse decision, the file candidates and the
// historical inspection priorities of the selected entry analysis.
function checkEntryFacts({ inputs, entry, document, snapshotRef, indexed, claim, evidence }: Selection): Set<unknown> {
  const { artifacts, run } = inputs;
  const plan = document(entry.planRef) as Fields;
  const runs = document(entry.knipRunsRef) as Fields;
  const preflight = document(runs.preflightRef) as Fields;
  const profile = artifacts.get(runs.profileRef as string);
  assert(plan.snapshotRef === snapshotRef && runs.snapshotRef === snapshotRef && preflight.snapshotRef === snapshotRef &&
    Array.isArray(plan.workspaces) && Array.isArray(runs.runs) && profile &&
    same(runs.inputDigests, { planSha256: (artifacts.get(entry.planRef as string) as Artifact).sha256, profileSha256: profile.sha256,
      preflightSha256: (artifacts.get(runs.preflightRef as string) as Artifact).sha256,
      inventorySha256: (artifacts.get(run.snapshot.inventoryRef) as Artifact).sha256 }),
  'Retained Knip receipts differ from their saved inputs.');
  const assessment = entry.knipAssessment as Fields | undefined;
  assert(assessment?.action === 'reuse' && text(assessment.reason), 'Missing Knip reuse decision.');
  evidence(entry.knipAssessment);
  const workspaces = new Set((plan.workspaces as Fields[]).map(record => record.dir));
  const fileEntries = new Set<unknown>();
  for (const candidate of list(entry.candidates, 'entry candidates') as Fields[]) {
    claim(candidate.id);
    assert(text(candidate.expression) && (candidate.path === null || indexed.has(candidate.path)) &&
      workspaces.has(candidate.workspace) && strings(candidate.roles) &&
      oneOf(['package-field', 'script', 'convention', 'source', 'inference', 'unknown'], candidate.origin), 'Invalid candidate: ' + candidate.id);
    evidence(candidate);
    fileEntries.add(candidate.id);
  }
  let lastPriority = 1;
  for (const item of list(entry.inspectionPriorities, 'historical inspection priorities') as Fields[]) {
    claim(item.id);
    assert(Number.isInteger(item.priority) && (item.priority as number) >= lastPriority && (item.priority as number) <= 3 &&
      strings(item.subjectRefs) && text(item.action) && text(item.reason), 'Invalid historical priority: ' + item.id);
    lastPriority = item.priority as number;
    evidence(item);
  }
  return fileEntries;
}

// A behavior entry or resource access names a source site inside a reviewed range that the item cites.
function sourceSiteCheck({ indexed, resolve }: Selection, reviewedRanges: Fields[]): (item: Fields) => void {
  return function sourceSite(item) {
    const site = item.source as Fields | undefined;
    const lines = site?.lines as number[];
    const supports = (range: unknown): boolean => {
      const reviewed = range as Fields | undefined;
      const reviewedLines = reviewed?.lines as number[];
      return reviewed?.path === site?.path && Array.isArray(reviewed?.lines) &&
        (reviewedLines[0] as number) <= (lines[0] as number) && (reviewedLines[1] as number) >= (lines[1] as number);
    };
    assert(indexed.has(site?.path) && Array.isArray(site?.lines) && lines.length === 2 &&
      lines.every(Number.isSafeInteger) && (lines[0] as number) > 0 && (lines[1] as number) >= (lines[0] as number) &&
      reviewedRanges.some(supports), 'Site is outside the selected source review history: ' + item.id);
    assert((item.evidenceRefs as unknown[]).some(ref => supports(resolve(ref))), 'Missing cited reviewed source for site: ' + item.id);
  };
}

interface BehaviorInputs { componentIds: Set<unknown>; mapped: Map<unknown, unknown>; fileEntries: Set<unknown>; sourceSite(item: Fields): void }

function checkBehavior(selection: Selection, { componentIds, mapped, fileEntries, sourceSite }: BehaviorInputs): void {
  const { entry, discovery, claim, evidence } = selection;
  const behaviorEntries = new Map<unknown, Fields>();
  for (const item of list(entry.behaviorEntries, 'behavior entries') as Fields[]) {
    claim(item.id);
    assert(text(item.kind) && text(item.expression) && componentIds.has(item.componentRef) &&
      strings(item.fileEntryRefs) && item.fileEntryRefs.every(id => fileEntries.has(id)), 'Invalid behavior entry: ' + item.id);
    sourceSite(item);
    assert(mapped.get((item.source as Fields).path) === item.componentRef, 'Behavior entry differs from the mapped source owner: ' + item.id);
    evidence(item);
    behaviorEntries.set(item.id, item);
  }
  for (const item of list(discovery.inspectedPaths, 'inspected paths') as Fields[]) {
    claim(item.id);
    assert(text(item.description) && behaviorEntries.has(item.entryPointRef) && strings(item.componentIds) &&
      item.componentIds.every(id => componentIds.has(id)) &&
      item.componentIds.includes((behaviorEntries.get(item.entryPointRef) as Fields).componentRef as string) &&
      Array.isArray(item.steps) && item.steps.length > 0 && strings(item.limits), 'Invalid inspected path: ' + item.id);
    evidence(item);
    for (const step of item.steps as Fields[]) {
      assert(text(step.action), 'Missing inspected path step: ' + item.id);
      evidence(step);
    }
  }
}

function checkResourceAccess(selection: Selection, { componentIds, mapped, sourceSite }: BehaviorInputs, historyRefs: unknown[]): void {
  const { access, discovery, baseline, claim, resolve, evidence } = selection;
  const scope = access.scope as Fields | undefined;
  assert(access.kind === 'resource-observations' && scope?.method === 'source-inspection' &&
    scope.reviewedFilesRef === discovery.entryAnalysisRef + '#/reviewedFiles' &&
    same(scope.historicalEntryAnalysisRefs, historyRefs) && strings(access.limits), 'Invalid resource observation scope.');
  resolve(scope.reviewedFilesRef);
  const resources = new Set((baseline.resources as Fields[]).map(record => record.id));
  for (const item of list(access.observations, 'observed access') as Fields[]) {
    claim(item.id);
    const target = item.target as Fields | undefined;
    assert(componentIds.has(item.componentRef) && text(item.operation) && text(item.context) &&
      text(target?.expression) && oneOf(['symbolic', 'unknown'], target.identity) &&
      (target.resourceRef === null || resources.has(target.resourceRef)), 'Invalid resource access: ' + item.id);
    sourceSite(item);
    assert(mapped.get((item.source as Fields).path) === item.componentRef, 'Resource actor differs from the mapped source owner: ' + item.id);
    evidence(item);
  }
}

function checkReadiness(selection: Selection, packet: Map<string, Buffer>): void {
  const { inputs, discovery, baseline, snapshotRef, claim, resolve, evidence } = selection;
  const saved = (name: string): Buffer => packet.get(name) as Buffer;
  const readiness = inputs.parse(saved('readiness.yaml').toString('utf8')) as Fields;
  const scope = json(saved('review-scope.json')) as Fields;
  const call = inputs.parse(saved('llm/analysis-call.yaml').toString('utf8')) as Fields;
  const selected = Object.fromEntries(factKeys.map(key => [key, discovery[key]]));
  const identity = (value: Fields): boolean => value.formatVersion === 1 && value.runRef === inputs.run.id &&
    value.snapshotRef === snapshotRef && value.baselineId === baseline.id;
  assert(exact(readiness, ['formatVersion', 'runRef', 'snapshotRef', 'baselineId', 'status', 'draftDigests', 'selectedRefs', 'checks', 'limits']) &&
    identity(readiness) && readiness.status === 'ready-with-gaps' && same(readiness.draftDigests, inputs.draftDigests) &&
    same(readiness.selectedRefs, selected) && strings(readiness.limits) && Array.isArray(readiness.checks) && readiness.checks.length > 0,
  'Readiness review does not match the current drafts and selected facts.');
  for (const check of readiness.checks as Fields[]) {
    assert(exact(check, ['id', 'text', 'evidenceRefs']) && text(check.text), 'Invalid readiness check.');
    claim(check.id);
    evidence(check);
  }
  assert(exact(scope, ['formatVersion', 'runRef', 'snapshotRef', 'baselineId', 'suppliedArtifactRefs', 'limits']) &&
    identity(scope) && strings(scope.suppliedArtifactRefs) && strings(scope.limits), 'Missing or invalid readiness review scope.');
  scope.suppliedArtifactRefs.forEach(resolve);
  assert(text(call.provider) && text(call.model) && text(call.date) && (object(call.settings) || call.settings === 'unknown') &&
    text(saved('llm/analysis-prompt.md').toString('utf8')) &&
    saved('llm/analysis-response.md').toString('utf8').includes(saved('readiness.yaml').toString('utf8').trimEnd()),
  'Incomplete readiness prompt, response or call metadata.');
}

function recordCounts({ source, graph, mapping, baseline, entry, discovery, access, count }: Selection, mapped: Map<unknown, unknown>): RecordCounts {
  const length = (value: unknown): number => (value as unknown[]).length;
  return { evidenceRefsResolved: count(), sourceRecordsVerified: source.verified.size, graphContexts: length(graph.contexts),
    mappedFiles: mapped.size, unknownOwners: (mapping.units as Fields[]).filter(unit => unit.owner === null).length,
    components: length(baseline.components), interfaces: length(baseline.interfaces), resources: length(baseline.resources),
    rules: length(baseline.rules), behaviorEntries: length(entry.behaviorEntries), inspectedPaths: length(discovery.inspectedPaths),
    observations: length(access.observations), questions: length(discovery.questions), gaps: length(discovery.gaps) };
}

export function validateRecords(inputs: RecordInputs): RecordCounts {
  const selection = select(inputs);
  const { baseline, discovery, snapshotRef, source, evidence } = selection;
  checkIssues(selection);
  const { componentIds, members } = validateBaseline({ baseline, discovery, claim: selection.claim, evidence });
  evidence(discovery.overview);
  const history = selectedHistory(selection);
  const documentation = { baseline, discovery, evidence, source, reviewedRanges: history.reviewedRanges };
  validateDocumentation(documentation);
  const mapped = checkMapping(selection, members, history);
  validateSourceUsage({ ...documentation, snapshotRef, componentIds, mapped });
  validateSystemEntryPoints({ ...documentation, snapshotRef, componentIds, mapped });
  const fileEntries = checkEntryFacts(selection);
  const behavior = { componentIds, mapped, fileEntries, sourceSite: sourceSiteCheck(selection, history.reviewedRanges) };
  checkBehavior(selection, behavior);
  const { graph, entry, indexed, resolve, claim } = selection;
  const profile = selection.document(graph.profileRef) as Fields;
  validateGraph({ graph, graphRef: discovery.dependenciesRef, profile, entry, indexed, resolve, claim, evidence });
  checkResourceAccess(selection, behavior, history.historyRefs);
  if (inputs.packet !== undefined) checkReadiness(selection, inputs.packet);
  return recordCounts(selection, mapped);
}

// Stages 4 and 5 validate the same discovery contract before saving working drafts.
// Stage 6 additionally supplies and validates a readiness packet.
export function validateDiscoveryRecords(inputs: RecordInputs): RecordCounts {
  return validateRecords({ ...inputs, packet: undefined });
}
