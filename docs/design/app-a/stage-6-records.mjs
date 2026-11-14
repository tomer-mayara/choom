import { createHash } from 'node:crypto';
import { isDeepStrictEqual as same } from 'node:util';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const factKeys = ['entryAnalysisRef', 'codeMappingRef', 'dependenciesRef', 'resourceAccessRef'];
export const packetFiles = ['readiness.yaml', 'review-scope.json', 'llm/analysis-prompt.md',
  'llm/analysis-response.md', 'llm/analysis-call.yaml'];
const issueKeys = ['questions', 'gaps'];
const collectionKeys = ['components', 'interfaces', 'resources', 'rules'];
const sourceLimit = 2 * 1024 * 1024;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const strings = value => Array.isArray(value) && value.length > 0 && value.every(text);
const plainId = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
const safe = path => text(path) && !/[\\\u0000-\u001f\u007f]/.test(path) &&
  path.split('/').every(part => part && part !== '.' && part !== '..');
const json = bytes => JSON.parse(bytes.toString('utf8'));
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function list(value, label) {
  assert(Array.isArray(value), 'Missing ' + label + ' list.');
  return value;
}

function fields(value, required, optional = []) {
  return object(value) && required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}

function boundedText(value, bytes = 8192) {
  return text(value) && Buffer.byteLength(value, 'utf8') <= bytes;
}

function validateSourceLocation(note, source) {
  const location = note.location;
  const record = source.records.get(note.evidenceRef);
  assert(!note.evidenceRef.includes('#') && exact(location, ['snapshotRef', 'path', 'sha256', 'lines']) &&
    boundedText(location.snapshotRef, 4096) &&
    boundedText(location.path, 4096) && safe(location.path) && !/^[A-Za-z]:/.test(location.path) &&
    /^[a-fA-F0-9]{64}$/.test(location.sha256) &&
    Array.isArray(location.lines) && location.lines.length === 2 && location.lines.every(Number.isSafeInteger) &&
    location.lines[0] > 0 && location.lines[1] >= location.lines[0] && record &&
    same(location, { snapshotRef: record.snapshotRef, path: record.path, sha256: record.sha256, lines: record.lines }),
  'Source note differs from its saved source record: ' + note.evidenceRef);
  source.verify(record);
}

// The saved tools run outside the viewer. Keep its bounded YAML profile here too.
// The caller supplies the trusted, pinned YAML module; no saved run code is loaded.
export function readBaselineYaml(bytes, yaml) {
  assert(bytes.length <= 16 * 1024 * 1024, 'Baseline exceeds the 16 MiB file limit.');
  const input = bytes.toString('utf8');
  assert(Buffer.from(input).equals(bytes), 'Baseline must use UTF-8.');
  const { CST, Lexer, Parser, Composer, visit, isScalar } = yaml;
  const nodeLimit = 250000;
  const structure = () => { throw new Error('Baseline exceeds the YAML structure limit.'); };
  const lines = /\r\n|[\r\n]/gu;
  let lineCount = 0;
  while (lines.test(input)) if (++lineCount > nodeLimit) structure();
  let tokens = 0;
  let commas = 0;
  let scalar = false;
  for (const token of new Lexer().lex(input)) {
    assert(++tokens <= 1500000, 'Baseline exceeds the YAML token limit.');
    if (!scalar && token === ',' && ++commas > nodeLimit) structure();
    scalar = !scalar && token === CST.SCALAR;
  }
  const properties = items => assert(!items.some(item => ['anchor', 'tag'].includes(item.type)),
    'Baseline YAML anchors and explicit tags are unsupported.');
  let nodes = 0;
  function inspect(token, depth) {
    if (++nodes > nodeLimit) structure();
    assert(!['alias', 'error'].includes(token?.type), 'Baseline YAML aliases and syntax errors are unsupported.');
    if (!CST.isCollection(token)) {
      if (token?.type !== 'block-scalar' || depth > 0)
        CST.resolveAsScalar(token, true, () => { throw new Error('Invalid baseline YAML scalar.'); });
      return;
    }
    if (depth >= 32) structure();
    if (token.type === 'flow-collection') {
      for (const [index, item] of token.items.entries()) {
        const separators = item.start.filter(part => part.type === 'comma').length;
        const empty = item.key === undefined && !item.sep && !item.value;
        assert(!(separators > 1 || (index === 0 && separators > 0) ||
          (index > 0 && !empty && separators === 0) || (empty && index < token.items.length - 1)),
        'Invalid baseline YAML flow separators.');
      }
    }
    const sequence = token.type === 'block-seq' ||
      (token.type === 'flow-collection' && token.start.type === 'flow-seq-start');
    for (const { start, key, sep, value } of token.items) {
      properties(start);
      if (sep) properties(sep);
      if (key === undefined && !value && !start.some(item => item.type === 'seq-item-ind')) continue;
      const implicitMap = sequence && key !== undefined;
      if (implicitMap && (depth + 1 >= 32 || ++nodes > nodeLimit)) structure();
      const nextDepth = depth + (implicitMap ? 2 : 1);
      if (!sequence || implicitMap) inspect(key, nextDepth);
      inspect(value, nextDepth);
    }
  }
  function* checkedTokens() {
    let documents = 0;
    for (const token of new Parser().parse(input)) {
      assert(!['directive', 'error'].includes(token.type), 'Baseline YAML directives and syntax errors are unsupported.');
      if (token.type === 'document') {
        assert(++documents === 1, 'Baseline must contain one YAML document.');
        properties(token.start);
        inspect(token.value, 0);
      }
      yield token;
    }
    assert(documents === 1, 'Baseline must contain one YAML document.');
  }
  const composer = new Composer({ schema: 'core', version: '1.2', strict: true, merge: false,
    resolveKnownTags: false, uniqueKeys: false, prettyErrors: false });
  const [document] = [...composer.compose(checkedTokens())];
  assert(document && !document.errors.length && !document.warnings.length, 'Baseline must contain valid YAML.');
  visit(document, {
    Map: (_key, map) => {
      const keys = new Set();
      for (const { key } of map.items) {
        assert(isScalar(key) && typeof key.value === 'string' && !keys.has(key.value),
          'Baseline YAML mapping keys must be unique strings.');
        keys.add(key.value);
      }
    },
    Scalar: (_key, { value }) => assert(value === null || ['string', 'boolean'].includes(typeof value) ||
      (typeof value === 'number' && Number.isFinite(value)), 'Baseline must contain JSON-compatible data.'),
  });
  return document.toJS({ maxAliasCount: 0 });
}

function validateDocumentation({ baseline, discovery, evidence, source, reviewedRanges }) {
  const documents = baseline.interfaces.filter(item => Object.hasOwn(item, 'documentation'));
  assert(Buffer.byteLength(JSON.stringify(documents.map(item => item.documentation)), 'utf8') <= 2 * 1024 * 1024,
    'Interface documentation exceeds the 2 MiB byte limit.');
  const unknowns = new Set([...discovery.questions, ...discovery.gaps].flatMap(issue => issue.subjectRefs));
  const reviewed = new Set(reviewedRanges.map(record => record.id));
  for (const item of documents) {
    const citations = new Set();
    const root = item.id + '.documentation';
    const nullableText = (value, path) => value === null ? unknowns.has(path) : boundedText(value);
    function statement(record, path, valid) {
      assert(exact(record, ['value', 'status', 'evidenceRefs']) && record.status === 'proposed' &&
        strings(record.evidenceRefs) && record.evidenceRefs.every(ref => boundedText(ref, 4096)), 'Invalid proposed documentation statement: ' + path);
      evidence(record);
      record.evidenceRefs.forEach(ref => citations.add(ref));
      assert(valid(record.value, path), 'Invalid or unexplained documentation fact: ' + path);
      return record.value;
    }
    for (const name of ['owner', 'publicAccess', 'allowedConsumers', 'promises'])
      item[name]?.evidenceRefs?.forEach(ref => citations.add(ref));
    const doc = item.documentation;
    assert(exact(doc, ['summary', 'entries', 'sourceNotes']) && Array.isArray(doc.entries) &&
      doc.entries.length <= 32 && Array.isArray(doc.sourceNotes), 'Invalid interface documentation: ' + item.id);
    statement(doc.summary, root + '.summary', nullableText);
    const entryIds = new Set();
    const reviewedExamples = [];
    for (const entry of doc.entries) {
      const path = root + '.entries.' + entry?.id;
      assert(fields(entry, ['id', 'name', 'accessPoint', 'kind', 'description', 'examples'], ['interaction', 'signature']) &&
        plainId(entry.id) && boundedText(entry.id, 4096) && !entryIds.has(entry.id) && boundedText(entry.name) &&
        boundedText(entry.accessPoint, 4096) && item.publicAccess.value?.includes(entry.accessPoint) &&
        Array.isArray(entry.examples) && entry.examples.length <= 8, 'Invalid documentation entry: ' + path);
      entryIds.add(entry.id);
      const kind = statement(entry.kind, path + '.kind', (value, subject) => value === null ? unknowns.has(subject) :
        ['function', 'command', 'type', 'data', 'message', 'workflow'].includes(value));
      statement(entry.description, path + '.description', nullableText);
      if (Object.hasOwn(entry, 'signature')) {
        assert(kind === 'function', 'Signature requires a function or method entry: ' + path);
        statement(entry.signature, path + '.signature', nullableText);
      }
      if (Object.hasOwn(entry, 'interaction')) {
        assert(['function', 'command', 'workflow'].includes(kind), 'Interaction requires a callable or workflow entry: ' + path);
        statement(entry.interaction, path + '.interaction', (value, subject) =>
          exact(value, ['input', 'success', 'failures', 'effects']) &&
          Object.entries(value).every(([key, fact]) => nullableText(fact, subject + '.' + key)));
      }
      const exampleIds = new Set();
      for (const example of entry.examples) {
        const subject = path + '.examples.' + example?.id;
        assert(exact(example, ['id', 'name', 'basis', 'content']) && plainId(example.id) && boundedText(example.id, 4096) &&
          !exampleIds.has(example.id) && boundedText(example.name) && ['illustrative', 'source-reviewed'].includes(example.basis),
        'Invalid documented example: ' + subject);
        exampleIds.add(example.id);
        statement(example.content, subject + '.content', value => fields(value, ['text'], ['input', 'result']) &&
          boundedText(value.text, 16384) && (!Object.hasOwn(value, 'input') || boundedText(value.input, 16384)) &&
          (!Object.hasOwn(value, 'result') || (exact(value.result, ['text', 'summary', 'scope']) &&
            boundedText(value.result.text, 16384) && boundedText(value.result.summary) &&
            ['complete', 'excerpt'].includes(value.result.scope))));
        if (example.basis === 'source-reviewed') reviewedExamples.push({ example, subject });
      }
    }
    const located = new Set();
    const notes = new Set();
    for (const note of doc.sourceNotes) {
      assert(fields(note, ['evidenceRef', 'description'], ['location']) && boundedText(note.evidenceRef, 4096) &&
        citations.has(note.evidenceRef) && !notes.has(note.evidenceRef) && boundedText(note.description),
      'Invalid source note: ' + item.id);
      notes.add(note.evidenceRef);
      if (!Object.hasOwn(note, 'location')) continue;
      validateSourceLocation(note, source);
      located.add(note.evidenceRef);
    }
    for (const { example, subject } of reviewedExamples)
      assert(example.content.evidenceRefs.some(ref => reviewed.has(ref) && located.has(ref)),
        'Source-reviewed example needs its own reviewed range and location note: ' + subject);
  }
}

function validateSourceUsage({ baseline, discovery, snapshotRef, componentIds, mapped, evidence, source, reviewedRanges }) {
  if (!Object.hasOwn(baseline, 'sourceUsage')) return;
  const usage = baseline.sourceUsage;
  assert(baseline.formatVersion === 3 && exact(usage, ['snapshotRef', 'mappingRef', 'assessments']) &&
    boundedText(usage.snapshotRef, 4096) && boundedText(usage.mappingRef, 4096) && Array.isArray(usage.assessments),
  'Invalid sourceUsage record.');
  assert(usage.snapshotRef === snapshotRef, 'sourceUsage.snapshotRef differs from the run snapshot.');
  assert(usage.mappingRef === discovery.codeMappingRef, 'sourceUsage.mappingRef differs from the selected candidate mapping.');
  assert(Buffer.byteLength(JSON.stringify(usage), 'utf8') <= 2 * 1024 * 1024,
    'sourceUsage exceeds the 2 MiB byte limit.');
  const interfaces = new Map(baseline.interfaces.map(item => [item.id, item]));
  const assessed = new Set();
  const reviewed = new Set(reviewedRanges.map(record => record.id));
  const unknowns = new Set([...discovery.questions, ...discovery.gaps].flatMap(issue => issue.subjectRefs));
  const id = value => plainId(value) && boundedText(value, 4096);
  const references = value => strings(value) && new Set(value).size === value.length &&
    value.every(ref => boundedText(ref, 4096));
  let uses = 0;
  let notes = 0;
  for (const assessment of usage.assessments) {
    assert(exact(assessment, ['interfaceId', 'scope', 'evidenceRefs', 'limitations', 'uses', 'sourceNotes']) &&
      id(assessment.interfaceId) && interfaces.has(assessment.interfaceId) && !assessed.has(assessment.interfaceId) &&
      boundedText(assessment.scope) && references(assessment.evidenceRefs) && Array.isArray(assessment.limitations) &&
      assessment.limitations.every(value => boundedText(value)) && Array.isArray(assessment.uses) && Array.isArray(assessment.sourceNotes),
    'Invalid or duplicate source-use assessment: ' + assessment?.interfaceId);
    assessed.add(assessment.interfaceId);
    uses += assessment.uses.length;
    notes += assessment.sourceNotes.length;
    assert(uses <= 2000, 'sourceUsage exceeds the 2,000-use limit.');
    assert(notes <= 4000, 'sourceUsage exceeds the 4,000-source-note limit.');
    evidence(assessment);
    const item = interfaces.get(assessment.interfaceId);
    const entries = new Map((item.documentation?.entries ?? []).map(entry => [entry.id, entry]));
    const useIds = new Set();
    const citations = new Set(assessment.evidenceRefs);
    for (const use of assessment.uses) {
      const path = assessment.interfaceId + '.sourceUsage.uses.' + use?.id;
      assert(fields(use, ['id', 'consumerId', 'kind', 'context', 'description', 'callerRef', 'evidenceRefs'], ['accessPoint', 'entryId']) &&
        id(use.id) && !useIds.has(use.id) && (use.consumerId === null || (id(use.consumerId) && componentIds.has(use.consumerId))) &&
        ['value', 'type'].includes(use.kind) && ['application', 'tooling', 'test', 'unknown'].includes(use.context) &&
        boundedText(use.description) && boundedText(use.callerRef, 4096) && references(use.evidenceRefs) &&
        use.evidenceRefs.includes(use.callerRef), 'Invalid source use: ' + path);
      useIds.add(use.id);
      for (const ref of use.evidenceRefs) {
        assert(!ref.includes('#') && source.records.has(ref), 'Source use requires a direct source record: ' + path + ': ' + ref);
        assert(reviewed.has(ref), 'Source use is outside the selected source review history: ' + path + ': ' + ref);
        citations.add(ref);
      }
      evidence(use);
      assert(mapped.get(source.records.get(use.callerRef).path) === use.consumerId,
        'Source consumer differs from the direct mapped caller owner: ' + path);
      for (const field of ['consumerId', 'context']) {
        if (field === 'consumerId' ? use.consumerId === null : use.context === 'unknown')
          assert(unknowns.has(path + '.' + field), 'Missing exact discovery subject for unresolved source use: ' + path + '.' + field);
      }
      if (Object.hasOwn(use, 'accessPoint'))
        assert(boundedText(use.accessPoint, 4096) && item.publicAccess.value?.includes(use.accessPoint),
          'Unknown source-use access point: ' + path);
      if (Object.hasOwn(use, 'entryId'))
        assert(id(use.entryId) && entries.has(use.entryId), 'Unknown source-use documentation entry: ' + path);
      if (Object.hasOwn(use, 'accessPoint') && Object.hasOwn(use, 'entryId'))
        assert(entries.get(use.entryId).accessPoint === use.accessPoint, 'Conflicting source-use entry binding: ' + path);
    }
    const located = new Set();
    const noteRefs = new Set();
    for (const note of assessment.sourceNotes) {
      assert(fields(note, ['evidenceRef', 'description'], ['location']) && boundedText(note.evidenceRef, 4096) &&
        citations.has(note.evidenceRef) && !noteRefs.has(note.evidenceRef) && boundedText(note.description),
      'Invalid source-use note: ' + assessment.interfaceId);
      noteRefs.add(note.evidenceRef);
      if (!Object.hasOwn(note, 'location')) continue;
      validateSourceLocation(note, source);
      assert(note.location.snapshotRef === usage.snapshotRef,
        'Source-use note belongs to a different snapshot: ' + note.evidenceRef);
      located.add(note.evidenceRef);
    }
    for (const use of assessment.uses)
      for (const ref of use.evidenceRefs)
        assert(located.has(ref), 'Source use needs a located note for every evidence reference: ' + use.id + ': ' + ref);
  }
}

function validateDisplayLimits(baseline) {
  assert(collectionKeys.reduce((sum, key) => sum + list(baseline[key], key).length, 0) <= 500,
    'Baseline exceeds the 500-record display limit.');
  const links = baseline.interfaces.reduce((sum, item) => sum + Number(item.owner?.value != null) +
    (item.allowedConsumers?.value?.length ?? 0), 0) + baseline.resources.filter(item => item.owner?.value != null).length;
  assert(links <= 2000, 'Baseline exceeds the 2,000-link display limit.');
}

function sourcesFor({ artifacts, document, snapshotRef, inventory, readSource }) {
  const records = new Map();
  const excerpts = [];
  const indexes = new Map([[snapshotRef, inventory]]);
  for (const [id, { path }] of artifacts) {
    if (/\/(?:parent-)?inventory\.json$/.test(path)) {
      const record = document(id);
      if (record.formatVersion === 1 && text(record.snapshotId) && Array.isArray(record.files)) {
        const prior = indexes.get(record.snapshotId);
        assert(!prior || same(prior, record), 'Conflicting inventory for ' + record.snapshotId);
        indexes.set(record.snapshotId, record);
      }
    }
    if (/\/(?:source-excerpts\.json|excerpt-[0-9]+\.json)$/.test(path)) {
      const saved = document(id);
      if (Array.isArray(saved.excerpts)) excerpts.push(...saved.excerpts);
      else excerpts.push(saved);
    }
    if (!/\.ya?ml$/.test(path)) continue;
    const saved = document(id);
    if (!Array.isArray(saved?.reviewedFiles)) continue;
    for (const record of saved.reviewedFiles) {
      assert(text(record?.id) && !artifacts.has(record.id) &&
        (!records.has(record.id) || same(records.get(record.id), record)), 'Conflicting source record: ' + record?.id);
      records.set(record.id, record);
    }
  }
  const matches = (left, right) => left.snapshotRef === right.snapshotRef && left.path === right.path &&
    left.sha256 === right.sha256 && same(left.lines, right.lines);
  for (const excerpt of excerpts) {
    assert(text(excerpt?.id) && !artifacts.has(excerpt.id) && (!records.has(excerpt.id) || matches(records.get(excerpt.id), excerpt)),
      'Conflicting excerpt identity: ' + excerpt?.id);
    if (!records.has(excerpt.id)) records.set(excerpt.id, excerpt);
  }
  const indexed = new Map([...indexes].map(([id, index]) => [id, new Map(index.files.map(file => [file.path, file]))]));
  const linesByPath = new Map();
  const verified = new Set();
  function verify(record) {
    if (verified.has(record.id)) return;
    const saved = indexed.get(record.snapshotRef)?.get(record.path);
    assert(saved?.kind === 'file' && record.sha256 === saved.sha256 && Array.isArray(record.lines) &&
      record.lines.length === 2 && record.lines.every(Number.isSafeInteger) && record.lines[0] > 0 &&
      record.lines[1] >= record.lines[0], 'Source record is outside its own saved inventory: ' + record.id);
    const excerpt = excerpts.find(item => matches(item, record));
    assert(excerpt && (typeof excerpt.excerpt === 'string' || typeof excerpt.text === 'string'), 'Source range has no saved text: ' + record.id);
    const [first, last] = record.lines;
    if (record.snapshotRef === snapshotRef) {
      if (!linesByPath.has(record.path)) {
        const bytes = readSource(record.path, sourceLimit);
        assert(hash(bytes) === record.sha256, 'Changed source file: ' + record.path);
        const value = bytes.toString('utf8');
        assert(Buffer.from(value).equals(bytes), 'Source range is not UTF-8: ' + record.path);
        const lines = value ? value.split(/\r\n|\r|\n/) : [];
        if (/[\r\n]$/.test(value)) lines.pop();
        linesByPath.set(record.path, lines);
      }
      const lines = linesByPath.get(record.path);
      assert(last <= lines.length, 'Source range exceeds saved file: ' + record.id);
      const slice = lines.slice(first - 1, last);
      const expected = typeof excerpt.excerpt === 'string' ?
        slice.map((line, index) => (first + index) + ': ' + line).join('\n') : slice.join('\n');
      assert(expected === (excerpt.excerpt ?? excerpt.text), 'Saved source range differs: ' + record.id);
      if (Object.hasOwn(excerpt, 'totalLines')) assert(excerpt.totalLines === lines.length, 'Changed line count: ' + record.id);
    } else {
      // An older snapshot is not a fallback path. Only its registered inventory and saved excerpt are used.
      const lines = (excerpt.excerpt ?? excerpt.text).split('\n');
      assert(lines.length === last - first + 1 && (excerpt.excerpt === undefined ||
        lines.every((line, index) => line.startsWith((first + index) + ': '))),
      'Invalid numbered historical excerpt: ' + record.id);
    }
    verified.add(record.id);
  }
  return { records, verify, verified };
}

function validateBaseline({ baseline, discovery, claim, evidence }) {
  const keys = ['formatVersion', 'id', 'parentId', ...collectionKeys,
    ...(baseline?.formatVersion === 3 && Object.hasOwn(baseline, 'sourceUsage') ? ['sourceUsage'] : [])];
  assert(exact(baseline, keys) && [1, 2, 3].includes(baseline.formatVersion) &&
    plainId(baseline.id) && baseline.parentId === null, 'Expected a first proposed baseline.');
  validateDisplayLimits(baseline);
  const componentIds = new Set(list(baseline.components, 'components').map(item => item.id));
  assert(componentIds.size > 0 && componentIds.size === baseline.components.length, 'Missing or duplicate components.');
  const fields = {
    components: ['id', 'name', 'purpose', 'membership', 'groupingReason'],
    interfaces: ['id', 'name', 'owner', 'publicAccess', 'allowedConsumers', 'promises'],
    resources: ['id', 'name', 'identity', 'owner', 'accessRules'],
    rules: ['id', 'name', 'subject', 'expected', 'check'],
  };
  const unknown = id => [...discovery.questions, ...discovery.gaps]
    .some(issue => issue.subjectRefs.some(ref => ref === id || ref.startsWith(id + '.')));
  const parents = new Map();
  const members = new Map();
  function selector(path) {
    const base = path.endsWith('/**') ? path.slice(0, -3) : path;
    return safe(base) && !/^[A-Za-z]:/.test(base) && !/[?*\[\]{}]/.test(base);
  }
  for (const [key, required] of Object.entries(fields)) {
    for (const item of list(baseline[key], key)) {
      const keys = [...required,
        ...(key === 'components' && Object.hasOwn(item, 'parent') ? ['parent'] : []),
        ...(key === 'interfaces' && [2, 3].includes(baseline.formatVersion) && Object.hasOwn(item, 'documentation') ? ['documentation'] : [])];
      assert(exact(item, keys) && plainId(item.id) && text(item.name), 'Invalid baseline item: ' + item?.id);
      claim(item.id);
      for (const [name, statement] of Object.entries(item)) {
        if (name === 'id' || name === 'name' || name === 'documentation') continue;
        assert(exact(statement, ['value', 'status', 'evidenceRefs']) && statement.status === 'proposed',
          'Only proposed intent is supported: ' + item.id + '.' + name);
        evidence(statement);
        if (statement.value === null)
          assert(name === 'parent' || unknown(item.id), 'Unexplained unknown intent: ' + item.id + '.' + name);
      }
      if (item.owner?.value != null) assert(componentIds.has(item.owner.value), 'Unknown proposed owner: ' + item.id);
      if (key === 'interfaces') {
        if (item.publicAccess?.value != null)
          assert(strings(item.publicAccess.value), 'Invalid interface access points: ' + item.id);
        const consumers = item.allowedConsumers?.value;
        if (consumers != null) assert(strings(consumers) && new Set(consumers).size === consumers.length &&
          consumers.every(id => componentIds.has(id)), 'Invalid allowed consumers: ' + item.id);
        const promises = item.promises?.value;
        if (promises != null) assert(exact(promises, ['behavior', 'data', 'errors', 'lifecycle']) &&
          Object.values(promises).every(value => text(value) || (value === null && unknown(item.id))),
        'Invalid interface promises: ' + item.id);
      }
      if (key === 'resources')
        for (const name of ['identity', 'accessRules'])
          assert(item[name]?.value == null || text(item[name].value), 'Invalid resource intent: ' + item.id + '.' + name);
      if (key === 'rules')
        for (const name of ['subject', 'expected', 'check'])
          assert(item[name]?.value == null || object(item[name].value), 'Invalid rule intent: ' + item.id + '.' + name);
      if (key !== 'components') continue;
      assert(text(item.purpose?.value) && text(item.groupingReason?.value), 'Missing component intent: ' + item.id);
      const parent = item.parent?.value ?? null;
      assert(parent === null || componentIds.has(parent), 'Unknown component parent: ' + item.id);
      parents.set(item.id, parent);
      const value = item.membership?.value;
      assert(object(value) && strings(value.paths) && value.paths.every(selector) &&
        (!Object.hasOwn(value, 'excludePaths') || (Array.isArray(value.excludePaths) &&
          value.excludePaths.every(path => text(path) && selector(path)))) &&
        Object.keys(value).every(name => ['paths', 'excludePaths'].includes(name)),
      'Unsupported membership selectors: ' + item.id);
      members.set(item.id, item.membership);
    }
  }
  for (const id of componentIds) {
    const ancestors = new Set([id]);
    for (let parent = parents.get(id); parent !== null; parent = parents.get(parent)) {
      assert(!ancestors.has(parent), 'Component parent cycle: ' + id);
      ancestors.add(parent);
      assert(ancestors.size <= 16, 'Baseline exceeds the 16-parent-level display limit.');
    }
  }
  return { componentIds, members };
}

function validateGraph({ graph, graphRef, profile, entry, indexed, resolve, claim, evidence }) {
  assert(graph.formatVersion === 1 && graph.snapshotRef === entry.snapshotRef && graph.status === 'completed' &&
    graph.coverage === 'partial' && strings(graph.limits) && Array.isArray(graph.contexts) && graph.contexts.length > 0 &&
    profile.formatVersion === 1 && profile.snapshotRef === entry.snapshotRef && Array.isArray(profile.contexts) &&
    same(graph.contexts.map(context => context.id), profile.contexts.map(context => context.id)),
  'Missing graph result or coverage limits.');
  resolve(graph.profileRef);
  assert(entry.reachability?.status === 'assessed-with-limits' &&
    entry.reachability.method === 'context-specific-source-graph-traversal' &&
    entry.reachability.dependenciesRef === graphRef && text(entry.reachability.reason) &&
    same(entry.reachability.contexts, graph.contexts.map(({ id }, index) => ({ id, resultRef: graphRef + '#/contexts/' + index + '/reachability' }))),
  'Entry analysis does not retain separate graph reachability contexts.');
  const contextIds = new Set();
  for (const [index, context] of graph.contexts.entries()) {
    assert(text(context.id) && !contextIds.has(context.id) && context.status === 'completed' &&
      context.coverage === 'partial' && strings(context.limits) && Array.isArray(context.scanFiles),
    'Missing or duplicate graph context: ' + context.id);
    const input = profile.contexts[index];
    assert(same([context.scanFiles, context.roots, context.compilerSettingsRef, context.conditionNames, context.moduleSystems],
      [input.sourceFiles, input.roots, input.compilerSettingsRef, input.conditionNames, input.moduleSystems]),
    'Graph context differs from its saved profile: ' + context.id);
    contextIds.add(context.id);
    const scope = new Set(context.scanFiles);
    assert(scope.size === context.scanFiles.length && [...scope].every(path => indexed.has(path)),
      'Invalid saved graph scope: ' + context.id);
    if (context.compilerSettingsRef !== null) resolve(context.compilerSettingsRef);
    const result = context.reachability;
    assert(result?.status === 'completed-with-limits' &&
      result.method === 'breadth-first traversal of retained internal source edges' &&
      result.edgePolicy === 'includes type-only, re-export, and literal-dynamic source dependencies; not runtime execution' &&
      Array.isArray(result.roots) && Array.isArray(result.reached) && Array.isArray(result.notReached) &&
      Array.isArray(result.stoppedEdges) && Array.isArray(context.roots) &&
      same(result.roots, context.roots.map(item => item.path)) &&
      result.roots.every(path => result.reached.includes(path)), 'Incomplete saved reachability: ' + context.id);
    const accounted = [...result.reached, ...result.notReached];
    assert(accounted.length === scope.size && new Set(accounted).size === scope.size && accounted.every(path => scope.has(path)),
      'Reachability does not match its saved context: ' + context.id);
    context.roots.forEach(evidence);
    const outgoing = new Map(context.scanFiles.map(path => [path, []]));
    for (const edge of list(context.edges, 'graph edges')) {
      claim(edge.id);
      assert(scope.has(edge.from) && text(edge.specifier) && Array.isArray(edge.dependencyTypes) &&
        edge.dependencyTypes.every(text) && [null, true, false].includes(edge.dynamic) && [null, true, false].includes(edge.preCompilationOnly),
      'Invalid observed edge: ' + edge.id);
      const target = edge.targetKind === 'internal' ? scope.has(edge.to) :
        edge.targetKind === 'context-boundary' ? indexed.has(edge.to) && !scope.has(edge.to) :
        ['external', 'builtin', 'unresolved'].includes(edge.targetKind) && edge.to === null;
      assert(target, 'Invalid observed edge target: ' + edge.id);
      evidence(edge);
      outgoing.get(edge.from).push(edge);
    }
    const reached = new Set(result.roots);
    const queue = [...reached];
    const stopped = [];
    for (let position = 0; position < queue.length; position++) {
      for (const edge of outgoing.get(queue[position])) {
        if (edge.targetKind !== 'internal') stopped.push(edge.id);
        else if (!reached.has(edge.to)) {
          reached.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
    assert(same(result.reached, [...reached].sort()) &&
      same(result.notReached, context.scanFiles.filter(path => !reached.has(path)).sort()) &&
      same(result.stoppedEdges, stopped.sort()), 'Saved traversal differs from the retained edges: ' + context.id);
  }
}

export function validateRecords({ run, discovery, baseline, inventory, artifacts, parse, readSource, packet, draftDigests, reservedIds = [] }) {
  const snapshotRef = run.snapshot.id;
  assert(discovery?.formatVersion === 1 && discovery.kind === 'architecture-discovery' && discovery.runRef === run.id &&
    !Object.hasOwn(discovery, 'baselineRef') && exact(discovery.overview, ['text', 'evidenceRefs']) && text(discovery.overview.text),
  'Expected complete working discovery with no fixed baseline reference.');
  assert(exact(discovery, ['formatVersion', 'kind', 'runRef', ...factKeys, 'overview', 'inspectedPaths', ...issueKeys]),
    'Unexpected working discovery fields.');
  const indexed = new Map(inventory.files.map(file => [file.path, file]));
  const documents = new Map();
  function document(id) {
    const artifact = artifacts.get(id);
    assert(artifact, 'Unknown artifact: ' + id);
    if (!documents.has(id))
      documents.set(id, /\.ya?ml$/.test(artifact.path) ? parse(artifact.bytes.toString('utf8')) : json(artifact.bytes));
    return documents.get(id);
  }
  const selected = Object.fromEntries(factKeys.map(key => [key, discovery[key]]));
  const [entry, mapping, graph, access] = factKeys.map(key => document(discovery[key]));
  assert([entry, mapping, graph, access].every(record => record.formatVersion === 1 && record.snapshotRef === snapshotRef),
    'A selected fact belongs to a different snapshot.');
  const source = sourcesFor({ artifacts, document, snapshotRef, inventory, readSource });
  const occupied = new Set([...artifacts.keys(), ...source.records.keys()]);
  function claim(id) {
    assert(text(id) && !occupied.has(id), 'Invalid or colliding model ID: ' + id);
    occupied.add(id);
  }
  reservedIds.forEach(claim);
  let refs = 0;
  function resolve(ref) {
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
    let value = record ?? document(base);
    for (const part of pointer === '' ? [] : pointer.slice(1).split('/')) {
      const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
      assert(!/~(?:[^01]|$)/.test(part) && value !== null && typeof value === 'object' &&
        (!Array.isArray(value) || /^(0|[1-9][0-9]*)$/.test(key)) && Object.hasOwn(value, key), 'Unresolved evidence: ' + ref);
      value = value[key];
    }
    return value;
  }
  function evidence(record) {
    assert(strings(record.evidenceRefs), 'Missing evidence for ' + (record.id ?? 'record'));
    record.evidenceRefs.forEach(resolve);
  }
  for (const kind of issueKeys) {
    assert(same(list(discovery[kind], kind), entry[kind]), 'Selected entry and discovery issues differ: ' + kind);
    for (const issue of discovery[kind]) {
      claim(issue.id);
      assert(strings(issue.subjectRefs) && (kind === 'questions' ? text(issue.text) : text(issue.reason) && text(issue.kind)),
        'Invalid ' + kind + ': ' + issue.id);
      evidence(issue);
    }
  }
  const { componentIds, members } = validateBaseline({ baseline, discovery, claim, evidence });
  evidence(discovery.overview);

  const chain = [];
  const histories = new Set();
  for (let ref = discovery.entryAnalysisRef; ref !== undefined;) {
    assert(text(ref) && !histories.has(ref), 'Invalid selected entry-analysis history.');
    histories.add(ref);
    const record = document(ref);
    assert(record.formatVersion === 1 && record.kind === 'entry-analysis' && record.snapshotRef === snapshotRef &&
      record.llmReview === 'recorded' && Array.isArray(record.reviewedFiles), 'Invalid historical entry analysis: ' + ref);
    chain.push({ ref, record });
    record.reviewedFiles.forEach(source.verify);
    for (const kind of issueKeys) {
      const current = new Map(discovery[kind].map(item => [item.id, item]));
      for (const issue of list(record[kind], kind))
        assert(same(current.get(issue.id), issue), 'Earlier issue differs from selected history: ' + issue.id);
    }
    ref = record.previousEntryAnalysisRef;
  }
  const historyRefs = chain.slice(1).map(item => item.ref);
  const reviewedRanges = chain.flatMap(item => item.record.reviewedFiles);
  validateDocumentation({ baseline, discovery, evidence, source, reviewedRanges });
  const reviewedPaths = new Set(reviewedRanges.map(item => item.path));
  assert(mapping.kind === 'code-mapping' && mapping.scope?.inventoryRef === run.snapshot.inventoryRef &&
    mapping.scope.basis === 'all-inventoried-regular-files' && mapping.scope.unitKind === 'file' &&
    text(mapping.scope.inspectionMeaning) && mapping.scope.selectedEntryAnalysisRef === discovery.entryAnalysisRef &&
    same(mapping.scope.historicalEntryAnalysisRefs, historyRefs) && strings(mapping.limits) &&
    Array.isArray(mapping.units) && mapping.units.length === indexed.size, 'Invalid selected code mapping scope.');
  const mapped = new Map();
  const match = (path, selector) => selector.endsWith('/**') ? path.startsWith(selector.slice(0, -2)) : path === selector;
  for (const unit of mapping.units) {
    claim(unit.id);
    assert(!mapped.has(unit.path) && indexed.has(unit.path) && indexed.get(unit.path).sha256 === unit.sha256 && strings(unit.roles) &&
      text(unit.reason) && unit.inspection === (reviewedPaths.has(unit.path) ? 'reviewed' : 'unreviewed'),
    'Invalid mapped unit or inspection coverage: ' + unit.path);
    const owners = [...members].filter(([, { value }]) => value.paths.some(pattern => match(unit.path, pattern)) &&
      !(value.excludePaths ?? []).some(pattern => match(unit.path, pattern))).map(([id]) => id);
    assert(same(owners, unit.owner === null ? [] : [unit.owner]), 'Mapping and direct membership differ: ' + unit.path);
    if (unit.owner === null) assert(unit.membershipRef === null, 'Unknown unit selects a membership: ' + unit.path);
    else {
      const selectedMembership = resolve(unit.membershipRef);
      assert(same(selectedMembership, members.get(unit.owner)) || same(selectedMembership, members.get(unit.owner).value),
        'Mapped membership reference differs from proposed intent: ' + unit.path);
    }
    evidence(unit);
    mapped.set(unit.path, unit.owner);
  }
  validateSourceUsage({ baseline, discovery, snapshotRef, componentIds, mapped, evidence, source, reviewedRanges });

  const plan = document(entry.planRef);
  const runs = document(entry.knipRunsRef);
  const preflight = document(runs.preflightRef);
  const profile = artifacts.get(runs.profileRef);
  assert(plan.snapshotRef === snapshotRef && runs.snapshotRef === snapshotRef && preflight.snapshotRef === snapshotRef &&
    Array.isArray(plan.workspaces) && Array.isArray(runs.runs) && profile &&
    same(runs.inputDigests, { planSha256: artifacts.get(entry.planRef).sha256, profileSha256: profile.sha256,
      preflightSha256: artifacts.get(runs.preflightRef).sha256, inventorySha256: artifacts.get(run.snapshot.inventoryRef).sha256 }),
  'Retained Knip receipts differ from their saved inputs.');
  assert(entry.knipAssessment?.action === 'reuse' && text(entry.knipAssessment.reason), 'Missing Knip reuse decision.');
  evidence(entry.knipAssessment);
  const workspaces = new Set(plan.workspaces.map(record => record.dir));
  const fileEntries = new Set();
  for (const candidate of list(entry.candidates, 'entry candidates')) {
    claim(candidate.id);
    assert(text(candidate.expression) && (candidate.path === null || indexed.has(candidate.path)) &&
      workspaces.has(candidate.workspace) && strings(candidate.roles) &&
      ['package-field', 'script', 'convention', 'source', 'inference', 'unknown'].includes(candidate.origin), 'Invalid candidate: ' + candidate.id);
    evidence(candidate);
    fileEntries.add(candidate.id);
  }
  let lastPriority = 1;
  for (const item of list(entry.inspectionPriorities, 'historical inspection priorities')) {
    claim(item.id);
    assert(Number.isInteger(item.priority) && item.priority >= lastPriority && item.priority <= 3 &&
      strings(item.subjectRefs) && text(item.action) && text(item.reason), 'Invalid historical priority: ' + item.id);
    lastPriority = item.priority;
    evidence(item);
  }
  function sourceSite(item) {
    const { source: site } = item;
    const supports = range => range?.path === site.path && Array.isArray(range.lines) &&
      range.lines[0] <= site.lines[0] && range.lines[1] >= site.lines[1];
    assert(indexed.has(site?.path) && Array.isArray(site.lines) && site.lines.length === 2 &&
      site.lines.every(Number.isSafeInteger) && site.lines[0] > 0 && site.lines[1] >= site.lines[0] &&
      reviewedRanges.some(supports), 'Site is outside the selected source review history: ' + item.id);
    assert(item.evidenceRefs.some(ref => supports(resolve(ref))), 'Missing cited reviewed source for site: ' + item.id);
  }
  const behaviorEntries = new Map();
  for (const item of list(entry.behaviorEntries, 'behavior entries')) {
    claim(item.id);
    assert(text(item.kind) && text(item.expression) && componentIds.has(item.componentRef) &&
      strings(item.fileEntryRefs) && item.fileEntryRefs.every(id => fileEntries.has(id)), 'Invalid behavior entry: ' + item.id);
    sourceSite(item);
    assert(mapped.get(item.source.path) === item.componentRef, 'Behavior entry differs from the mapped source owner: ' + item.id);
    evidence(item);
    behaviorEntries.set(item.id, item);
  }
  for (const item of list(discovery.inspectedPaths, 'inspected paths')) {
    claim(item.id);
    assert(text(item.description) && behaviorEntries.has(item.entryPointRef) && strings(item.componentIds) &&
      item.componentIds.every(id => componentIds.has(id)) && item.componentIds.includes(behaviorEntries.get(item.entryPointRef).componentRef) &&
      Array.isArray(item.steps) && item.steps.length > 0 && strings(item.limits), 'Invalid inspected path: ' + item.id);
    evidence(item);
    for (const step of item.steps) {
      assert(text(step.action), 'Missing inspected path step: ' + item.id);
      evidence(step);
    }
  }
  validateGraph({ graph, graphRef: discovery.dependenciesRef, profile: document(graph.profileRef), entry, indexed, resolve, claim, evidence });

  assert(access.kind === 'resource-observations' && access.scope?.method === 'source-inspection' &&
    access.scope.reviewedFilesRef === discovery.entryAnalysisRef + '#/reviewedFiles' &&
    same(access.scope.historicalEntryAnalysisRefs, historyRefs) && strings(access.limits), 'Invalid resource observation scope.');
  resolve(access.scope.reviewedFilesRef);
  const resources = new Set(baseline.resources.map(record => record.id));
  for (const item of list(access.observations, 'observed access')) {
    claim(item.id);
    assert(componentIds.has(item.componentRef) && text(item.operation) && text(item.context) &&
      text(item.target?.expression) && ['symbolic', 'unknown'].includes(item.target.identity) &&
      (item.target.resourceRef === null || resources.has(item.target.resourceRef)), 'Invalid resource access: ' + item.id);
    sourceSite(item);
    assert(mapped.get(item.source.path) === item.componentRef, 'Resource actor differs from the mapped source owner: ' + item.id);
    evidence(item);
  }

  const summary = () => ({ evidenceRefsResolved: refs, sourceRecordsVerified: source.verified.size, graphContexts: graph.contexts.length,
    mappedFiles: mapped.size, unknownOwners: mapping.units.filter(unit => unit.owner === null).length,
    components: baseline.components.length, interfaces: baseline.interfaces.length, resources: baseline.resources.length,
    rules: baseline.rules.length, behaviorEntries: entry.behaviorEntries.length, inspectedPaths: discovery.inspectedPaths.length,
    observations: access.observations.length, questions: discovery.questions.length, gaps: discovery.gaps.length });
  if (packet === undefined) return summary();
  const readiness = parse(packet.get('readiness.yaml').toString('utf8'));
  const scope = json(packet.get('review-scope.json'));
  const call = parse(packet.get('llm/analysis-call.yaml').toString('utf8'));
  const identity = value => value.formatVersion === 1 && value.runRef === run.id && value.snapshotRef === snapshotRef &&
    value.baselineId === baseline.id;
  assert(exact(readiness, ['formatVersion', 'runRef', 'snapshotRef', 'baselineId', 'status', 'draftDigests', 'selectedRefs', 'checks', 'limits']) &&
    identity(readiness) && readiness.status === 'ready-with-gaps' && same(readiness.draftDigests, draftDigests) &&
    same(readiness.selectedRefs, selected) && strings(readiness.limits) && Array.isArray(readiness.checks) && readiness.checks.length > 0,
  'Readiness review does not match the current drafts and selected facts.');
  for (const check of readiness.checks) {
    assert(exact(check, ['id', 'text', 'evidenceRefs']) && text(check.text), 'Invalid readiness check.');
    claim(check.id);
    evidence(check);
  }
  assert(exact(scope, ['formatVersion', 'runRef', 'snapshotRef', 'baselineId', 'suppliedArtifactRefs', 'limits']) &&
    identity(scope) && strings(scope.suppliedArtifactRefs) && strings(scope.limits), 'Missing or invalid readiness review scope.');
  scope.suppliedArtifactRefs.forEach(resolve);
  assert(text(call.provider) && text(call.model) && text(call.date) && (object(call.settings) || call.settings === 'unknown') &&
    text(packet.get('llm/analysis-prompt.md').toString('utf8')) &&
    packet.get('llm/analysis-response.md').toString('utf8').includes(packet.get('readiness.yaml').toString('utf8').trimEnd()),
  'Incomplete readiness prompt, response or call metadata.');
  return summary();
}

// Stages 4 and 5 validate the same discovery contract before saving working drafts.
// Stage 6 additionally supplies and validates a readiness packet.
export function validateDiscoveryRecords(inputs) {
  return validateRecords({ ...inputs, packet: undefined });
}
