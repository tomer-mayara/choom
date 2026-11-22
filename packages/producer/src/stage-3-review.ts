import { isDeepStrictEqual } from 'node:util';
import { checkReasoningNotSaved, checkVisibleResponse } from './llm-response.ts';
import { checkQuestionsAndGaps } from './questions-and-gaps.ts';
import { assert, evidenceBase, exact, type Fields, object, type PointerMessages, resolveEvidence, strings, text }
  from './record-checks.ts';
import { SubjectChecker, type SubjectRecord } from './record-subjects.ts';
import { CandidateClaims } from './stage-2-candidate-claims.ts';
import { StageThreeGaps } from './stage-3-gaps.ts';
import { InspectionClues } from './stage-3-inspection-clues.ts';

// The checks of the Stage 3 entry analysis and its LLM review packet against the
// saved attempt, the earlier entry analyses and the snapshot. The Stage 3
// finalizer runs them after it checked the attempt receipts and the earlier
// records, and before it publishes or verifies the drafts.
export interface ReviewInputs {
  id: string;
  run: Fields;
  discovery: Fields;
  previous: Fields;
  previousRef: string;
  snapshotRef: string;
  paths: Map<unknown, Fields>;
  workspaces: Set<unknown>;
  names: string[];
  // The path of each registered artifact and attempt file, by its artifact ID.
  artifacts: Record<string, { path: string }>;
  buffers: Map<string, Buffer>;
  document(ref: string): unknown;
  saved(name: string): unknown;
  receipt(phase: string, action: string, outputs: string[]): void;
  checkedSourceBytes(record: Fields, label: string): Buffer;
}
export interface Review { analysis: Fields; currentExcerpts: Fields[] }
type Evidence = (record: Fields) => void;
// The source records, saved excerpts and model IDs that the analysis checks share.
interface Sources {
  records: Map<unknown, Fields>;
  excerpts: Fields[];
  excerptRecords: Map<unknown, Fields>;
  claim(id: unknown, fresh?: boolean): void;
  checkSource(record: Fields): void;
  lines(path: unknown): string[];
}

const issueKinds = ['questions', 'gaps'] as const;
const origins = ['package-field', 'script', 'convention', 'source', 'inference', 'unknown'];
const sameSource = (left: Fields, right: Fields): boolean => left.snapshotRef === right.snapshotRef &&
  left.path === right.path && left.sha256 === right.sha256 && isDeepStrictEqual(left.lines, right.lines);
// An ID that this attempt adds: it starts with the attempt ID and is not a saved file ID.
const newId = (id: string) => (value: unknown): boolean => text(value) && value.startsWith(id + '-') &&
  !value.startsWith(id + '-file@');

export function utf8(bytes: Buffer, label: string): string {
  const value = bytes.toString('utf8');
  assert(Buffer.from(value).equals(bytes), 'Invalid UTF-8: ' + label);
  return value;
}

function fields(value: unknown, keys: string[], label: string): asserts value is Fields {
  assert(exact(value, keys), 'Invalid ' + label + ' fields.');
}

function checkIdentity({ previous, previousRef, snapshotRef }: ReviewInputs, analysis: unknown): asserts analysis is Fields {
  fields(analysis, ['formatVersion', 'kind', 'snapshotRef', 'previousEntryAnalysisRef', 'planRef', 'knipRunsRef',
    'candidates', 'reviewedFiles', 'questions', 'gaps', 'reachability', 'llmReview', 'knipAssessment',
    'inspectionPriorities'], 'Stage 3 entry analysis');
  assert(analysis.formatVersion === 1 && analysis.kind === 'entry-analysis' && analysis.snapshotRef === snapshotRef &&
    analysis.previousEntryAnalysisRef === previousRef && analysis.llmReview === 'recorded',
  'Invalid Stage 3 entry-analysis identity or review state.');
  const reachability = analysis.reachability;
  fields(reachability, ['status', 'reason'], 'reachability');
  assert(reachability.status === 'not-assessed' && text(reachability.reason),
    'Reachability must remain unassessed.');
  const assessment = analysis.knipAssessment;
  fields(assessment, ['action', 'reason', 'evidenceRefs'], 'Knip assessment');
  assert(assessment.action !== 'rerun-required' && analysis.planRef === previous.planRef &&
    analysis.knipRunsRef === previous.knipRunsRef,
  'Knip rerun required. Save a new controlled Knip attempt and prepare a new Stage 3 attempt.');
  assert(assessment.action === 'reuse' && text(assessment.reason),
    'Expected a justified Knip reuse assessment.');
}

// The collected excerpts and the excerpts that this attempt saved later, each with its receipt.
function savedExcerpts({ names, saved, receipt, snapshotRef }: ReviewInputs): Fields[] {
  const excerptBundle = saved('source-excerpts.json') as Fields | null | undefined;
  assert(excerptBundle?.formatVersion === 1 && excerptBundle.snapshotRef === snapshotRef &&
    Array.isArray(excerptBundle.excerpts), 'Invalid collected excerpts.');
  const currentExcerpts = [...excerptBundle.excerpts as Fields[]];
  for (const name of names.filter(name => /^excerpt-[0-9]+\.json$/.test(name))) {
    receipt(name.slice(0, -5), 'excerpt', [name]);
    currentExcerpts.push(saved(name) as Fields);
  }
  return currentExcerpts;
}

// The excerpts and reviewed source records that the registered artifacts already hold.
function historicalSources({ run, buffers, document }: ReviewInputs, excerpts: Fields[], records: Map<unknown, Fields>): void {
  for (const [ref, artifact] of Object.entries(run.artifacts as Record<string, Fields>)) {
    if (!/\.(?:json|ya?ml)$/.test(artifact.path as string)) continue;
    let saved: Fields | null | undefined;
    try { saved = document(ref) as Fields | null | undefined; } catch { continue; }
    if (Array.isArray(saved?.excerpts)) excerpts.push(...saved.excerpts as Fields[]);
    if (text(saved?.excerpt)) excerpts.push(saved as Fields);
    if (!Array.isArray(saved?.reviewedFiles)) continue;
    for (const record of saved.reviewedFiles as Fields[]) {
      assert(text(record?.id) && !buffers.has(record.id) &&
        (!records.has(record.id) || isDeepStrictEqual(records.get(record.id), record)),
      'Conflicting historical source ID: ' + record?.id);
      records.set(record.id, record);
    }
  }
}

// The check that a reviewed source range is inside its indexed snapshot file.
function sourceRanges({ snapshotRef, paths, checkedSourceBytes }: ReviewInputs): Pick<Sources, 'checkSource' | 'lines'> {
  const sourceLines = new Map<unknown, string[]>();
  function checkSource(record: Fields): void {
    const saved = paths.get(record?.path);
    const lines = record?.lines as number[];
    assert(text(record?.id) && record.snapshotRef === snapshotRef && saved?.kind === 'file' &&
      record.sha256 === saved.sha256 && Array.isArray(record.lines) && lines.length === 2 &&
      lines.every(Number.isSafeInteger) && (lines[0] as number) >= 1 && (lines[1] as number) >= (lines[0] as number),
    'Invalid reviewed source: ' + record?.id);
    if (!sourceLines.has(record.path)) {
      const value = utf8(checkedSourceBytes(record, 'Reviewed'), record.path as string);
      const split = value ? value.split(/\r\n|\r|\n/) : [];
      if (/[\r\n]$/.test(value)) split.pop();
      sourceLines.set(record.path, split);
    }
    assert((lines[1] as number) <= (sourceLines.get(record.path) as string[]).length,
      'Reviewed range exceeds source: ' + record.id);
  }
  return { checkSource, lines: path => sourceLines.get(path) as string[] };
}

function sourceIndex(inputs: ReviewInputs, currentExcerpts: Fields[]): Sources {
  const records = new Map<unknown, Fields>();
  const excerpts = [...currentExcerpts];
  historicalSources(inputs, excerpts, records);
  const excerptRecords = new Map<unknown, Fields>();
  for (const excerpt of excerpts) {
    const prior = excerptRecords.get(excerpt?.id) ?? records.get(excerpt?.id);
    assert(text(excerpt?.id) && !inputs.buffers.has(excerpt.id) && (!prior || sameSource(prior, excerpt)),
      'Conflicting excerpt source ID: ' + excerpt?.id);
    excerptRecords.set(excerpt.id, excerpt);
  }
  const identifiers = new Set<unknown>([...inputs.buffers.keys(), ...records.keys(), ...excerptRecords.keys()]);
  const fresh = newId(inputs.id);
  function claim(id: unknown, isNew = false): void {
    assert(text(id) && (!isNew || fresh(id)) && !identifiers.has(id), 'Invalid or colliding analysis ID: ' + id);
    identifiers.add(id);
  }
  return { records, excerpts, excerptRecords, claim, ...sourceRanges(inputs) };
}

function checkReviewedFiles({ id, snapshotRef }: ReviewInputs, analysis: Fields, sources: Sources): void {
  assert(Array.isArray(analysis.reviewedFiles), 'Missing reviewed source list.');
  for (const record of analysis.reviewedFiles as unknown[]) {
    fields(record, ['id', 'snapshotRef', 'path', 'sha256', 'lines'], 'reviewed source');
    const supplied = sources.excerptRecords.get(record.id);
    if (supplied) {
      assert(newId(id)(record.id) && !sources.records.has(record.id) && sameSource(record, supplied),
        'A reviewed source ID must match its supplied excerpt and be new: ' + record.id);
    } else sources.claim(record.id, true);
    sources.checkSource(record);
    const [first, last] = record.lines as [number, number];
    const numbered = sources.lines(record.path).slice(first - 1, last)
      .map((line, index) => (first + index) + ': ' + line).join('\n');
    assert(sources.excerpts.some(excerpt => excerpt?.snapshotRef === snapshotRef && excerpt.path === record.path &&
      excerpt.sha256 === record.sha256 && isDeepStrictEqual(excerpt.lines, record.lines) && excerpt.excerpt === numbered),
    'Reviewed range does not match a saved excerpt: ' + record.id);
    sources.records.set(record.id, record);
  }
}

// The words of the Stage 3 messages for a JSON Pointer that it refuses.
const pointerMessages: PointerMessages = { invalid: 'Invalid JSON Pointer: ', escape: 'Unresolved JSON Pointer: ',
  index: 'Unresolved JSON Pointer: ', unresolved: 'Unresolved JSON Pointer: ' };

// Each evidence reference names a saved artifact or source record, and its JSON Pointer resolves.
function evidenceCheck({ id, artifacts, buffers, document }: ReviewInputs, sources: Sources): Evidence {
  return function evidence(record) {
    assert(strings(record.evidenceRefs), 'Missing evidence for ' + (record.id ?? 'Knip assessment'));
    for (const ref of record.evidenceRefs) {
      const base = evidenceBase(ref);
      assert(base !== id + '-entry-analysis' && (buffers.has(base) || sources.records.has(base)), 'Unknown evidence: ' + ref);
      const source = sources.records.get(base);
      if (source) sources.checkSource(source);
      resolveEvidence(ref, source ? { record: source } : { path: (artifacts[base] as { path: string }).path,
        document: () => document(base) }, pointerMessages);
    }
  };
}

// The LLM call record, the prompt and response, and the supplied-evidence scope.
function checkPacket({ id, run, snapshotRef, buffers, saved }: ReviewInputs, evidence: Evidence): void {
  const savedText = (name: string, label: string): string =>
    utf8(buffers.get(id + '-file@' + encodeURIComponent(name)) as Buffer, label);
  const call = saved('llm/analysis-call.yaml') as Fields;
  const scope = saved('llm/review-scope.json') as Fields;
  assert(text(call.provider) && text(call.model) && text(call.date) &&
    (object(call.settings) || call.settings === 'unknown'), 'Missing LLM call metadata; use unknown for unexposed settings.');
  assert(text(savedText('llm/analysis-prompt.md', 'LLM prompt')) && savedText('llm/analysis-response.md', 'LLM response')
    .includes(utf8(buffers.get(id + '-entry-analysis') as Buffer, 'entry analysis').trimEnd()),
  'Keep the complete prompt and response, including the exact entry-analysis YAML.');
  checkReasoningNotSaved(call, 'llm/analysis-call.yaml');
  checkVisibleResponse(savedText('llm/analysis-response.md', 'LLM response'), 'llm/analysis-response.md');
  assert(scope.formatVersion === 1 && scope.runRef === run.id && scope.snapshotRef === snapshotRef &&
    strings(scope.suppliedArtifactRefs) && strings(scope.limits), 'Missing or invalid LLM review scope.');
  evidence({ evidenceRefs: scope.suppliedArtifactRefs });
}

// Earlier questions and gaps stay unchanged; new ones get new IDs. Returns the new ones.
function checkIssues({ previous, discovery }: ReviewInputs, analysis: Fields, sources: Sources, evidence: Evidence): Fields[] {
  const addedIssues: Fields[] = [];
  for (const kind of issueKinds) {
    assert([previous[kind], discovery[kind], analysis[kind]].every(Array.isArray), 'Missing ' + kind + ' list.');
    const prior = new Map<unknown, Fields>();
    const items = analysis[kind] as Fields[];
    const current = new Map(items.map(item => [item?.id, item]));
    for (const item of [...previous[kind] as Fields[], ...discovery[kind] as Fields[]]) {
      assert(text(item?.id) && isDeepStrictEqual(current.get(item.id), item), 'Removed or changed prior ' + kind + ': ' + item?.id);
      prior.set(item.id, item);
    }
    for (const item of items) {
      const isNew = !prior.has(item?.id);
      sources.claim(item?.id, isNew);
      if (isNew) fields(item, kind === 'questions' ? ['id', 'subjectRefs', 'text', 'evidenceRefs']
        : ['id', 'kind', 'subjectRefs', 'reason', 'evidenceRefs'], kind + ' record');
      assert(strings(item.subjectRefs) && (kind === 'questions' ? text(item.text) : text(item.kind) && text(item.reason)),
        'Invalid ' + kind + ' record: ' + item.id);
      evidence(item);
      if (isNew) addedIssues.push(item);
    }
  }
  checkQuestionsAndGaps({ questions: analysis.questions, gaps: analysis.gaps });
  return addedIssues;
}

// Earlier candidates stay unchanged, or a new question or gap notes why one was omitted.
function checkCandidates(inputs: ReviewInputs, analysis: Fields, sources: Sources, evidence: Evidence, addedIssues: Fields[]): void {
  const { previous, previousRef, paths, workspaces } = inputs;
  const previousCandidates = previous.candidates as Fields[];
  const priorCandidates = new Map(previousCandidates.map((item, index) => [item?.id, { item, index }]));
  assert(priorCandidates.size === previousCandidates.length, 'Duplicate previous candidate IDs.');
  assert(Array.isArray(analysis.candidates), 'Missing candidate list.');
  const runsRef = previous.knipRunsRef as string;
  const receipts = inputs.document(runsRef) as Fields;
  const claims = new CandidateClaims(runsRef, receipts.runs as Fields[], name => {
    const ref = runsRef.slice(0, -'-knip-runs'.length) + '-file@' + encodeURIComponent(name);
    const bytes = inputs.buffers.get(ref);
    assert(bytes, 'Missing selected Knip report: ' + ref);
    return JSON.parse(bytes.toString('utf8'));
  });
  const candidateIds = new Set<unknown>();
  for (const item of analysis.candidates as unknown[]) {
    const hasClaims = object(item) && Object.hasOwn(item, 'knipClaims');
    fields(item, ['id', 'expression', 'path', 'workspace', 'roles', 'origin', 'evidenceRefs',
      ...(hasClaims ? ['knipClaims'] : [])], 'candidate');
    const prior = priorCandidates.get(item.id);
    sources.claim(item.id, !prior);
    assert(!prior || isDeepStrictEqual(item, prior.item), 'Changed prior candidate: ' + item.id);
    assert(text(item.expression) && (item.path === null || paths.get(item.path)?.kind === 'file') &&
      strings(item.roles) && origins.includes(item.origin as string), 'Invalid candidate: ' + item.id);
    assert(workspaces.has(item.workspace), 'Unknown candidate workspace: ' + item.workspace);
    evidence(item);
    if (!prior) claims.validate(item, typeof inputs.run.projectKey === 'string');
    candidateIds.add(item.id);
  }
  for (const [candidateId, { index }] of priorCandidates) {
    assert(candidateIds.has(candidateId) || addedIssues.some(item => (item.subjectRefs as unknown[]).includes(candidateId) &&
      (item.evidenceRefs as unknown[]).includes(previousRef + '#/candidates/' + index)),
    'Missing note for omitted candidate: ' + candidateId);
  }
}

function checkPriorities(inputs: ReviewInputs, analysis: Fields, sources: Sources, evidence: Evidence): void {
  assert(Array.isArray(analysis.inspectionPriorities) && analysis.inspectionPriorities.length, 'Missing inspection priorities.');
  const loading = inputs.saved('loading-search.json') as Fields;
  assert(Array.isArray(loading.matches), 'Missing loading match list.');
  const clues = new InspectionClues(sources.records, analysis.candidates as Fields[],
    { ref: inputs.id + '-file@loading-search.json', matches: loading.matches });
  let lastPriority = 1;
  for (const item of analysis.inspectionPriorities as unknown[]) {
    fields(item, ['id', 'subjectRefs', 'priority', 'action', 'reason', 'evidenceRefs',
      ...(object(item) && Object.hasOwn(item, 'clue') ? ['clue'] : [])], 'inspection priority');
    sources.claim(item.id, true);
    const priority = item.priority as number;
    assert(Number.isInteger(priority) && priority >= lastPriority && priority <= 3 &&
      strings(item.subjectRefs) && text(item.action) && text(item.reason),
    'Invalid or out-of-order inspection priority: ' + item.id);
    evidence(item);
    clues.validate(item);
    lastPriority = priority;
  }
}

// The subjects of the new questions and gaps, and of each inspection priority. A
// subject names a snapshot file or folder, the snapshot ID, a question or gap, or an
// entry candidate of this analysis or of an entry analysis that the run registers. A
// clue keeps its own check (InspectionClues).
function checkSubjects({ paths, snapshotRef, run, document, discovery }: ReviewInputs, analysis: Fields): void {
  const subjects = SubjectChecker.forEntryRecord(paths.keys(), snapshotRef, analysis, { refs: Object.keys(run.artifacts as Fields), document });
  subjects.checkAdded(discovery);
  subjects.checkRecords(analysis.inspectionPriorities as SubjectRecord[], 'inspection priority');
}

export function checkReview(inputs: ReviewInputs): Review {
  const analysis = inputs.document(inputs.id + '-entry-analysis');
  checkIdentity(inputs, analysis);
  const currentExcerpts = savedExcerpts(inputs);
  const sources = sourceIndex(inputs, currentExcerpts);
  checkReviewedFiles(inputs, analysis, sources);
  const evidence = evidenceCheck(inputs, sources);
  evidence(analysis.knipAssessment as Fields);
  checkPacket(inputs, evidence);
  const addedIssues = checkIssues(inputs, analysis, sources, evidence);
  checkCandidates(inputs, analysis, sources, evidence, addedIssues);
  checkPriorities(inputs, analysis, sources, evidence);
  // The analysis copies each required gap of the symbol mentions and of the exports
  // records exactly (DB5). This check is before the subject check: a required gap of an
  // exports record keeps the subjects of its tool record, and the subject check knows it
  // by its exact form. So a required gap that the review changed gets the message of the
  // copy check, and not a message about a subject that it must keep.
  new StageThreeGaps(inputs.id).check(inputs.names, inputs.saved,
    { questions: analysis.questions as unknown[], gaps: analysis.gaps as unknown[] });
  checkSubjects(inputs, analysis);
  return { analysis, currentExcerpts };
}
