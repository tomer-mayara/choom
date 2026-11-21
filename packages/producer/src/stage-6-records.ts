import { isDeepStrictEqual as same } from 'node:util';
import type { Baseline } from '@choom/baseline-model/contracts';
import { validateDiscoveryResult } from '@choom/baseline-model/discovery-result';
import type * as Yaml from 'yaml';
import { checkReasoningNotSaved, checkVisibleResponse } from './llm-response.ts';
import { checkQuestionsAndGaps } from './questions-and-gaps.ts';
import { validateBoundaryReview } from './record-boundaries.ts';
import { validateBehaviorCandidates } from './record-behavior-candidates.ts';
import type { CandidateInputs } from './record-candidates.ts';
import { checkBaselineDocument, validateBaseline, validateDocumentation, validateSourceUsage, validateSystemEntryPoints }
  from './record-baseline.ts';
import { type Artifact, assert, exact, type Fields, hash, json, list, object, oneOf, strings, text,
  evidenceBase, type PointerMessages, resolveEvidence, savedDocument } from './record-checks.ts';
import { type MappedOwners, validateCodeMapping } from './record-code-mapping.ts';
import { validateGraph } from './record-graph.ts';
import { validateResourceCandidates } from './record-resource-candidates.ts';
import { type SourceRecords, sourcesFor } from './record-sources.ts';
import { checkSubjects } from './record-subjects.ts';
import { checkKnipResultGaps } from './result-gaps.ts';
import type { ProjectTools } from './snapshot-project.ts';

// The shared record validator. Stages 4 and 5 check the working discovery
// records before they save drafts; Stage 6 also checks a readiness packet before
// it saves the fixed baseline and discovery result.
export const factKeys = ['entryAnalysisRef', 'codeMappingRef', 'dependenciesRef', 'resourceAccessRef'];
export const packetFiles = ['readiness.yaml', 'review-scope.json', 'llm/analysis-prompt.md',
  'llm/analysis-response.md', 'llm/analysis-call.yaml'];
const issueKeys = ['questions', 'gaps'] as const;
// The fields of a working discovery. The fixed discovery result adds baselineRef and baselineDigest.
const discoveryKeys = ['formatVersion', 'kind', 'runRef', ...factKeys, 'overview', 'inspectedPaths', ...issueKeys];
const yamlNodeLimit = 250000;
// The words of the messages of Stages 4 to 6 for a JSON Pointer that they refuse.
const pointerMessages: PointerMessages = { invalid: 'Invalid JSON Pointer: ', escape: 'Unresolved evidence: ',
  index: 'Unresolved evidence: ', unresolved: 'Unresolved evidence: ' };

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
  // The IDs of the records that this stage's publication saves. The validator
  // always reserves the baseline ID too.
  reservedIds?: readonly unknown[];
  // The bytes of the saved baseline file, when `discovery` is the fixed discovery
  // result that Stage 6 saved (formatVersion 2) and not a working draft.
  baselineFile?: Buffer;
  // The ts-morph that divides a file that a symbol selector names, after the checks of the caller.
  divisionTools(): ProjectTools;
}
export type RecordCounts = Record<string, number>;
interface References {
  claim(id: unknown): void;
  reserve(id: unknown, use: string): void;
  resolve(ref: unknown): unknown;
  evidence(record: unknown): void;
  count(): number;
}
// The run, the selected fact records and the reference checks that every validation phase uses.
interface Selection extends References {
  inputs: RecordInputs;
  discovery: Fields;
  baseline: Baseline;
  snapshotRef: string;
  indexed: Map<unknown, Fields>;
  document(id: unknown): unknown;
  source: SourceRecords;
  entry: Fields;
  mapping: Fields;
  graph: Fields;
  access: Fields;
}
// The earlier entry analyses of the selected one, their reviewed source ranges, and the
// IDs of the entry candidates of all of them.
interface History { historyRefs: unknown[]; reviewedRanges: Fields[]; candidateIds: Set<unknown> }

// `label` names the record that the bounded YAML profile reads, at the start of
// each message, such as Baseline.
const structureLimit = (label: string): never => { throw new Error(label + ' exceeds the YAML structure limit.'); };
const refuseProperties = (items: Yaml.CST.SourceToken[], label: string): void =>
  assert(!items.some(item => oneOf(['anchor', 'tag'], item.type)), label + ' YAML anchors and explicit tags are unsupported.');

function checkLexerLimits(input: string, yaml: typeof Yaml, label: string): void {
  const lines = /\r\n|[\r\n]/gu;
  let lineCount = 0;
  while (lines.test(input)) if (++lineCount > yamlNodeLimit) structureLimit(label);
  let tokens = 0;
  let commas = 0;
  let scalar = false;
  for (const token of new yaml.Lexer().lex(input)) {
    assert(++tokens <= 1500000, label + ' exceeds the YAML token limit.');
    if (!scalar && token === ',' && ++commas > yamlNodeLimit) structureLimit(label);
    scalar = !scalar && token === yaml.CST.SCALAR;
  }
}

function checkFlowSeparators(token: Yaml.CST.FlowCollection, label: string): void {
  for (const [index, item] of token.items.entries()) {
    const separators = item.start.filter(part => part.type === 'comma').length;
    const empty = item.key === undefined && !item.sep && !item.value;
    assert(!(separators > 1 || (index === 0 && separators > 0) ||
      (index > 0 && !empty && separators === 0) || (empty && index < token.items.length - 1)),
    'Invalid ' + label.toLowerCase() + ' YAML flow separators.');
  }
}

// The structure of one YAML document within the node and depth limits, without
// aliases, anchors, tags or syntax errors.
function structureCheck(yaml: typeof Yaml, label: string): (token: Yaml.CST.Token | null | undefined, depth: number) => void {
  let nodes = 0;
  return function inspect(token, depth) {
    if (++nodes > yamlNodeLimit) structureLimit(label);
    assert(!oneOf(['alias', 'error'], token?.type), label + ' YAML aliases and syntax errors are unsupported.');
    if (!yaml.CST.isCollection(token)) {
      if (token?.type !== 'block-scalar' || depth > 0) yaml.CST.resolveAsScalar(token as Yaml.CST.FlowScalar, true, () => {
        throw new Error('Invalid ' + label.toLowerCase() + ' YAML scalar.');
      });
      return;
    }
    if (depth >= 32) structureLimit(label);
    if (token.type === 'flow-collection') checkFlowSeparators(token, label);
    const sequence = token.type === 'block-seq' ||
      (token.type === 'flow-collection' && token.start.type === 'flow-seq-start');
    for (const { start, key, sep, value } of token.items as Yaml.CST.CollectionItem[]) {
      refuseProperties(start, label);
      if (sep) refuseProperties(sep, label);
      if (key === undefined && !value && !start.some(item => item.type === 'seq-item-ind')) continue;
      const implicitMap = sequence && key !== undefined;
      if (implicitMap && (depth + 1 >= 32 || ++nodes > yamlNodeLimit)) structureLimit(label);
      const nextDepth = depth + (implicitMap ? 2 : 1);
      if (!sequence || implicitMap) inspect(key, nextDepth);
      inspect(value, nextDepth);
    }
  };
}

function* checkedTokens(input: string, yaml: typeof Yaml, label: string): Generator<Yaml.CST.Token> {
  const inspect = structureCheck(yaml, label);
  let documents = 0;
  for (const token of new yaml.Parser().parse(input)) {
    assert(!oneOf(['directive', 'error'], token.type), label + ' YAML directives and syntax errors are unsupported.');
    if (token.type === 'document') {
      assert(++documents === 1, label + ' must contain one YAML document.');
      refuseProperties(token.start, label);
      inspect(token.value, 0);
    }
    yield token;
  }
  assert(documents === 1, label + ' must contain one YAML document.');
}

// The saved tools run outside the viewer. Keep its bounded YAML profile here too,
// for the baseline and for the other saved records that use it, such as a
// decision file. The caller supplies the trusted, pinned YAML module; no saved run
// code is loaded.
export function readBoundedYaml(bytes: Buffer, yaml: typeof Yaml, label: string): unknown {
  assert(bytes.length <= 16 * 1024 * 1024, label + ' exceeds the 16 MiB file limit.');
  const input = bytes.toString('utf8');
  assert(Buffer.from(input).equals(bytes), label + ' must use UTF-8.');
  checkLexerLimits(input, yaml, label);
  const composer = new yaml.Composer({ schema: 'core', version: '1.2', strict: true, merge: false,
    resolveKnownTags: false, uniqueKeys: false, prettyErrors: false });
  const [document] = [...composer.compose(checkedTokens(input, yaml, label))];
  assert(document && !document.errors.length && !document.warnings.length, label + ' must contain valid YAML.');
  yaml.visit(document, {
    Map: (_key, map) => {
      const keys = new Set();
      for (const { key } of map.items) {
        assert(yaml.isScalar(key) && typeof key.value === 'string' && !keys.has(key.value),
          label + ' YAML mapping keys must be unique strings.');
        keys.add(key.value);
      }
    },
    Scalar: (_key, { value }) => assert(value === null || oneOf(['string', 'boolean'], typeof value) ||
      (typeof value === 'number' && Number.isFinite(value)), label + ' must contain JSON-compatible data.'),
  });
  return document.toJS({ maxAliasCount: 0 });
}

// A baseline under the bounded YAML profile, with the messages that start with Baseline.
export function readBaselineYaml(bytes: Buffer, yaml: typeof Yaml): unknown {
  return readBoundedYaml(bytes, yaml, 'Baseline');
}

function documentReader(artifacts: Map<string, Artifact>, parse: (text: string) => unknown): (id: unknown) => unknown {
  const documents = new Map<unknown, unknown>();
  return function document(id) {
    const artifact = artifacts.get(id as string);
    assert(artifact, 'Unknown artifact: ' + id);
    if (!documents.has(id)) documents.set(id, savedDocument(artifact.path, artifact.bytes.toString('utf8'), parse));
    return documents.get(id);
  };
}

// Model IDs must not collide with artifact IDs, source-range IDs, reserved IDs or
// other model IDs, and evidence references must resolve against the saved records.
function references(artifacts: Map<string, Artifact>, source: SourceRecords, document: (id: unknown) => unknown): References {
  const occupied = new Set<unknown>([...artifacts.keys(), ...source.records.keys()]);
  const reserved = new Map<unknown, string>();
  let refs = 0;
  function claim(id: unknown): void {
    assert(!reserved.has(id), 'The ID ' + id + ' is reserved for ' + reserved.get(id) + '. Use a different model ID.');
    assert(text(id) && !occupied.has(id), 'Invalid or colliding model ID: ' + id);
    occupied.add(id);
  }
  // An ID that publication gives to a record it saves. No model record can use it.
  function reserve(id: unknown, use: string): void {
    claim(id);
    reserved.set(id, use);
  }
  function resolve(ref: unknown): unknown {
    assert(text(ref), 'Empty evidence reference.');
    const base = evidenceBase(ref);
    const record = source.records.get(base);
    const artifact = artifacts.get(base);
    assert(artifact || record, 'Unknown evidence: ' + ref);
    refs++;
    if (record) source.verify(record);
    return resolveEvidence(ref, record ? { record } : { path: (artifact as Artifact).path, document: () => document(base) },
      pointerMessages);
  }
  function evidence(record: unknown): void {
    const fields = record as Fields;
    assert(strings(fields.evidenceRefs), 'Missing evidence for ' + (fields.id ?? 'record'));
    fields.evidenceRefs.forEach(resolve);
  }
  return { claim, reserve, resolve, evidence, count: () => refs };
}

// The reserved-ID rule of every publication stage. Stage 6 saves the fixed
// baseline under the baseline ID, so Stages 4 and 5 refuse that ID too, while
// the operator can still correct the draft. Each stage adds the IDs of the
// records that its own publication saves.
function reserveRecordIds(refs: References, baseline: Baseline, publicationIds: readonly unknown[]): void {
  refs.reserve(baseline.id, 'the baseline');
  for (const id of publicationIds) refs.reserve(id, 'a record that this publication saves');
}

function checkWorkingDiscovery(discovery: unknown, run: RunRecord): asserts discovery is Fields {
  const working = discovery as Fields | null | undefined;
  assert(working?.formatVersion === 1 && working.kind === 'architecture-discovery' && working.runRef === run.id &&
    !Object.hasOwn(working, 'baselineRef') && exact(working.overview, ['text', 'evidenceRefs']) && text(working.overview.text),
  'Expected complete working discovery with no fixed baseline reference.');
  assert(exact(working, discoveryKeys), 'Unexpected working discovery fields.');
}

// The viewer opens a fixed discovery result with the discovery contract of
// @choom/baseline-model (CR-004). The contract asks for exactly the fields of each
// question and gap, for its limits and for unique IDs. Stages 1 to 5 check the
// questions and gaps with the same rules where they enter the run, and Stage 6
// makes, publishes and verifies only a fixed discovery result that the viewer can open.
function checkViewerDiscovery(fixed: Fields, baselineRef: string, baselineFile: Buffer): void {
  const viewer = validateDiscoveryResult(fixed, { baseline: { id: baselineRef }, sha256: hash(baselineFile) });
  if (viewer.status === 'invalid') throw new Error('The viewer could not open the fixed discovery result. ' + viewer.message);
}

// The fixed discovery result that Stage 6 saved (formatVersion 2): the fields of a
// complete working discovery, the ID of the baseline and the SHA-256 of the bytes
// of its saved file, in the form that the viewer opens.
function checkFixedDiscovery(discovery: unknown, run: RunRecord, baseline: unknown, baselineFile: Buffer): asserts discovery is Fields {
  const fixed = discovery as Fields | null | undefined;
  assert(fixed?.formatVersion === 2 && fixed.kind === 'architecture-discovery' && fixed.runRef === run.id &&
    exact(fixed.overview, ['text', 'evidenceRefs']) && text(fixed.overview.text) &&
    exact(fixed, [...discoveryKeys, 'baselineRef', 'baselineDigest']),
  'Expected a complete fixed discovery result of formatVersion 2 with baselineRef and baselineDigest.');
  const baselineId = (baseline as Fields | null | undefined)?.id;
  assert(fixed.baselineRef === baselineId,
    `The discovery result names the baseline ${fixed.baselineRef}, but the saved baseline has the ID ${baselineId}.`);
  const sha256 = hash(baselineFile);
  assert(fixed.baselineDigest === sha256,
    `The discovery result names the baseline digest ${fixed.baselineDigest}, but the SHA-256 of the saved baseline file is ${sha256}.`);
  checkViewerDiscovery(fixed, String(fixed.baselineRef), baselineFile);
}

function select(inputs: RecordInputs): Selection {
  const { run, artifacts, inventory, readSource } = inputs;
  const discovery = inputs.discovery;
  const snapshotRef = run.snapshot.id;
  if (inputs.baselineFile === undefined) checkWorkingDiscovery(discovery, run);
  else checkFixedDiscovery(discovery, run, inputs.baseline, inputs.baselineFile);
  const baseline = checkBaselineDocument(inputs.baseline);
  const indexed = new Map((inventory.files as Fields[]).map(file => [file.path, file]));
  const document = documentReader(artifacts, inputs.parse);
  const [entry, mapping, graph, access] = factKeys.map(key => document(discovery[key]) as Fields) as [Fields, Fields, Fields, Fields];
  assert([entry, mapping, graph, access].every(record => record.formatVersion === 1 && record.snapshotRef === snapshotRef),
    'A selected fact belongs to a different snapshot.');
  const source = sourcesFor({ artifacts, document, snapshotRef, inventory, readSource });
  const refs = references(artifacts, source, document);
  reserveRecordIds(refs, baseline, inputs.reservedIds ?? []);
  return { ...refs, inputs, discovery, baseline, snapshotRef, indexed, document, source, entry, mapping, graph, access };
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
  checkQuestionsAndGaps(discovery);
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
  const candidates = chain.flatMap(item => Array.isArray(item.record.candidates) ? item.record.candidates as Fields[] : []);
  return { historyRefs: chain.slice(1).map(item => item.ref),
    reviewedRanges: chain.flatMap(item => item.record.reviewedFiles as Fields[]),
    candidateIds: new Set(candidates.map(candidate => candidate?.id)) };
}

// The retained Knip receipts, the reuse decision, the file candidates and the
// historical inspection priorities of the selected entry analysis.
function checkEntryFacts({ inputs, discovery, entry, document, snapshotRef, indexed, claim, evidence }: Selection): Set<unknown> {
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
  // A Knip result that did not run needs a gap that cites its record, as Stage 2 finish requires.
  checkKnipResultGaps({ gaps: discovery.gaps, preflightRef: runs.preflightRef, preflight, runsRef: entry.knipRunsRef, runs });
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
// The item cites the reviewed range itself: a reference that resolves to the whole range and whose ID is
// the ID of a reviewed range of the selected history. A reviewed range takes the ID of the excerpt that
// the review read, so an excerpt that no review read is not a reviewed range, also with the same path
// and lines. `label` names the kind of item in the message.
function sourceSiteCheck({ indexed, resolve }: Selection, reviewedRanges: Fields[]): (item: Fields, label: string) => void {
  const reviewedIds = new Set(reviewedRanges.map(range => range.id));
  return function sourceSite(item, label) {
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
    const cites = (ref: unknown): boolean => supports(resolve(ref)) && reviewedIds.has(evidenceBase(ref as string));
    assert((item.evidenceRefs as unknown[]).some(cites), label + ' ' + item.id +
      ' does not cite a reviewed range that contains its site. An excerpt that no review read is not a reviewed range.');
  };
}

// Each step of an inspected path cites at least one saved source range, and each
// source range that it cites is inside a reviewed range of the selected history: the
// same snapshot, path and digest, with reviewed lines that include its lines. This is
// the rule of the site of a behavior entry. A collected excerpt that no review read is
// not a reviewed range. A step can also cite other records, such as a graph record.
function stepSourceCheck({ source }: Selection, reviewedRanges: Fields[]): (path: Fields, step: Fields, number: number) => void {
  const inside = (record: Fields): boolean => reviewedRanges.some(range => {
    const [first, last] = range.lines as number[];
    const [from, to] = record.lines as number[];
    return range.snapshotRef === record.snapshotRef && range.path === record.path && range.sha256 === record.sha256 &&
      (first as number) <= (from as number) && (last as number) >= (to as number);
  });
  return function stepSource(path, step, number) {
    const name = String(path.id) + ' step ' + number;
    const cited = (step.evidenceRefs as string[]).filter(ref => source.records.has(evidenceBase(ref)));
    assert(cited.length > 0, 'Missing cited reviewed source for inspected path step: ' + name);
    for (const ref of cited) assert(inside(source.records.get(evidenceBase(ref)) as Fields),
      'Inspected path step is outside the selected source review history: ' + name + ': ' + ref);
  };
}

interface BehaviorInputs {
  componentIds: Set<unknown>;
  mapped: MappedOwners;
  fileEntries: Set<unknown>;
  sourceSite(item: Fields, label: string): void;
  stepSource(path: Fields, step: Fields, number: number): void;
}

function checkBehavior(selection: Selection, { componentIds, mapped, fileEntries, sourceSite, stepSource }: BehaviorInputs): void {
  const { entry, discovery, claim, evidence } = selection;
  const behaviorEntries = new Map<unknown, Fields>();
  for (const item of list(entry.behaviorEntries, 'behavior entries') as Fields[]) {
    claim(item.id);
    assert(text(item.kind) && text(item.expression) && componentIds.has(item.componentRef) &&
      strings(item.fileEntryRefs) && item.fileEntryRefs.every(id => fileEntries.has(id)), 'Invalid behavior entry: ' + item.id);
    sourceSite(item, 'Behavior entry');
    assert(mapped.owns((item.source as Fields).path, item.componentRef), 'Behavior entry differs from the mapped source owner: ' + item.id);
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
    for (const [index, step] of (item.steps as Fields[]).entries()) {
      assert(text(step.action), 'Missing inspected path step: ' + item.id);
      evidence(step);
      stepSource(item, step, index + 1);
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
  const resources = new Set<unknown>(baseline.resources.map(record => record.id));
  for (const item of list(access.observations, 'observed access') as Fields[]) {
    claim(item.id);
    const target = item.target as Fields | undefined;
    assert(componentIds.has(item.componentRef) && text(item.operation) && text(item.context) &&
      text(target?.expression) && oneOf(['symbolic', 'unknown'], target.identity) &&
      (target.resourceRef === null || resources.has(target.resourceRef)), 'Invalid resource access: ' + item.id);
    sourceSite(item, 'Resource access observation');
    assert(mapped.owns((item.source as Fields).path, item.componentRef), 'Resource actor differs from the mapped source owner: ' + item.id);
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
  if (baseline.formatVersion === 6) {
    const stage = String(discovery.entryAnalysisRef).replace(/-entry-analysis$/, '');
    const proposal = stage + '-file@baseline.proposed.yaml#/boundaryReview';
    const check = (readiness.checks as Fields[]).find((item) => item.id === 'boundary-review');
    const refs = check?.evidenceRefs;
    assert(Array.isArray(refs) && refs.includes(proposal) && refs.includes(discovery.codeMappingRef) &&
      (!baseline.boundaryReview.limitations.length || refs.includes(proposal + '/limitations')),
    'The v6 readiness packet needs a boundary-review check citing the selected review, mapping and applicable limitations.');
  }
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
  checkReasoningNotSaved(call, 'llm/analysis-call.yaml');
  checkVisibleResponse(saved('llm/analysis-response.md').toString('utf8'), 'llm/analysis-response.md');
}

function recordCounts({ source, graph, mapping, baseline, entry, discovery, access, count }: Selection, mapped: MappedOwners): RecordCounts {
  const length = (value: unknown): number => (value as unknown[]).length;
  return { evidenceRefsResolved: count(), sourceRecordsVerified: source.verified.size, graphContexts: length(graph.contexts),
    mappedFiles: mapped.files, unknownOwners: (mapping.units as Fields[]).filter(unit => unit.owner === null).length,
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
  checkSubjects({ discovery, snapshotRef, paths: selection.indexed.keys(), candidateIds: history.candidateIds, baseline });
  const documentation = { baseline, discovery, evidence, source, reviewedRanges: history.reviewedRanges };
  validateDocumentation(documentation);
  const mapped = validateCodeMapping({ ...selection, ...history, members, inventoryRef: inputs.run.snapshot.inventoryRef,
    readSource: inputs.readSource, divisionTools: inputs.divisionTools });
  validateSourceUsage({ ...documentation, snapshotRef, componentIds, mapped });
  validateSystemEntryPoints({ ...documentation, snapshotRef, componentIds, mapped });
  const fileEntries = checkEntryFacts(selection);
  const behavior = { componentIds, mapped, fileEntries, sourceSite: sourceSiteCheck(selection, history.reviewedRanges),
    stepSource: stepSourceCheck(selection, history.reviewedRanges) };
  checkBehavior(selection, behavior);
  const { graph, entry, access, indexed, resolve, claim } = selection;
  // Stages 4 and 5 name the behavior entry and resource access candidates of Stage 4 collect; the Stage 4/5 publisher
  // requires the names.
  const candidates = (ref: unknown): CandidateInputs => ({ ref, snapshotRef, artifacts: inputs.artifacts, indexed,
    document: selection.document, readSource: inputs.readSource });
  if (entry.behaviorEntryCandidatesRef !== undefined) validateBehaviorCandidates(candidates(entry.behaviorEntryCandidatesRef),
    (selection.document(entry.knipRunsRef) as Fields).preflightRef);
  const profile = selection.document(graph.profileRef) as Fields;
  validateGraph({ graph, graphRef: discovery.dependenciesRef, profile, entry, indexed, resolve, claim, evidence });
  if (inputs.run.projectKey !== undefined) assert(baseline.formatVersion === 6,
    'A project-keyed run needs a version 6 boundary review.');
  if (baseline.formatVersion === 6) validateBoundaryReview({ baseline, discovery, graph, entry, mapping: selection.mapping, source,
    reviewedRanges: history.reviewedRanges, run: inputs.run, artifacts: inputs.artifacts,
    document: selection.document, readSource: inputs.readSource });
  checkResourceAccess(selection, behavior, history.historyRefs);
  if (access.resourceAccessCandidatesRef !== undefined) validateResourceCandidates(candidates(access.resourceAccessCandidatesRef));
  if (inputs.packet !== undefined) checkReadiness(selection, inputs.packet);
  return recordCounts(selection, mapped);
}

// Stages 4 and 5 validate the same discovery contract before saving working drafts.
// Stage 6 additionally supplies and validates a readiness packet.
// Stage 6 verify validates the saved fixed records with the saved baseline file (baselineFile).
export function validateDiscoveryRecords(inputs: RecordInputs): RecordCounts {
  return validateRecords({ ...inputs, packet: undefined });
}

// The fixed discovery result that Stage 6 saves (formatVersion 2): the checked
// working discovery with the ID of the fixed baseline and the SHA-256 of the bytes
// of its saved file, as 64 lowercase hexadecimal characters. All other fields stay
// the same, in the same order. Every Stage 6 action makes it, so a result that the
// viewer cannot open stops Stage 6 before it publishes anything.
export function fixedDiscovery(working: Fields, baselineRef: string, baselineFile: Buffer): Fields {
  const fixed = { ...working, formatVersion: 2, baselineRef, baselineDigest: hash(baselineFile) };
  checkViewerDiscovery(fixed, baselineRef, baselineFile);
  return fixed;
}

// A saved fixed discovery result, read as the viewer reads its file: with the
// bounded YAML profile, so the YAML limits of the viewer apply to the bytes too.
export function readFixedDiscoveryYaml(bytes: Buffer, yaml: typeof Yaml): unknown {
  try {
    return readBoundedYaml(bytes, yaml, 'Fixed discovery result');
  } catch (error) {
    throw new Error('The viewer could not open the fixed discovery result. ' + (error as Error).message);
  }
}

// The file of the fixed discovery result: YAML text without aliases, which
// readFixedDiscoveryYaml reads back to the same result. A result within the limits
// of the discovery contract can still give a file that the viewer refuses, such
// as a file with more than 250,000 lines; Stage 6 then refuses the result.
export function fixedDiscoveryYaml(fixed: Fields, yaml: typeof Yaml): Buffer {
  const bytes = Buffer.from(yaml.stringify(fixed, { aliasDuplicateObjects: false }));
  assert(same(readFixedDiscoveryYaml(bytes, yaml), fixed), 'Fixed discovery serialization changed the reviewed result.');
  return bytes;
}
