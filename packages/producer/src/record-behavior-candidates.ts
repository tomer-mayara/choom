import { type CandidateInputs, checkSite, projectGap, savedRecord, type Sites, sitesOf, textAt } from './record-candidates.ts';
import { assert, exact, type Fields, object, text } from './record-checks.ts';

// The behavior entry candidates that a selected entry analysis names: the record that
// Stage 4 collect saved, with the saved rule list that it names. Each candidate and
// each settings gap names an indexed file with its inventory digest. The range of a
// syntax-rule candidate or gap lies in that saved file, and the text at the range
// starts with its expression. A handler range lies in the saved file that it names.
// The handler of a package-bin candidate also names its evidence: the snapshot holds
// the bin file, which is the handler, or a configuration of the settings record
// compiles the handler to the bin file. A knip-plugin-pattern candidate names the
// copied pattern of the Stage 2 preflight record that selected its file.
const label = 'behavior entry';
const candidateKeys = ['ruleId', 'ruleVersion', 'entryKind', 'found', 'role', 'roleRef', 'path', 'sha256', 'range', 'expression',
  'truncated', 'name', 'nameReason', 'handler', 'handlerReason'];
const patternSourceKeys = ['workspace', 'manifest', 'plugin', 'dependency', 'field', 'pattern'];
const patternCandidateKeys = ['found', 'role', 'roleRef', 'path', 'sha256', ...patternSourceKeys, 'patternRef'];
const settingsGapKeys = ['kind', 'ruleId', 'ruleVersion', 'entryKind', 'path', 'sha256', 'range', 'expression', 'truncated', 'reason'];
// The fields of each kind of evidence, after kind; each is text.
const evidenceKeys: Record<string, string[]> = { 'snapshot-file': ['binFile'],
  'compiler-output': ['binFile', 'compilerSettingsRef', 'outDir', 'rootDir'] };
const ruleKey = (item: Fields): string => [item.ruleId, item.ruleVersion, item.entryKind].join(' ');
const validRole = (item: Fields): boolean => item.role === 'test' ? text(item.roleRef) : item.role === 'unknown' && item.roleRef === null;
// The copied plugin patterns of the Stage 2 preflight record that the Knip receipts of the entry analysis name.
interface CopiedPatterns { ref: unknown; patterns: unknown[] }

// A handler: a path and a range, and for a package-bin rule also the evidence that links the file.
function validHandler(handler: Fields, ruleKind: unknown): boolean {
  if (ruleKind !== 'package-bin') return exact(handler, ['path', 'range']);
  const evidence = (object(handler.evidence) ? handler.evidence : {}) as Fields;
  const keys = Object.hasOwn(evidenceKeys, String(evidence.kind)) ? evidenceKeys[evidence.kind as string] as string[] : undefined;
  return exact(handler, ['path', 'range', 'evidence']) && keys !== undefined && exact(evidence, ['kind', ...keys]) &&
    keys.every(key => text(evidence[key])) && (evidence.kind !== 'snapshot-file' || evidence.binFile === handler.path);
}

// A file that a copied Knip plugin pattern selected: an indexed file with its inventory
// digest, and the copied pattern that patternRef names, with the same source fields.
function checkPatternCandidate(sites: Sites, copied: CopiedPatterns, item: Fields, name: string): void {
  const [, base, index] = /^(.+)#\/pluginEntryPatterns\/(0|[1-9][0-9]*)$/.exec(String(item.patternRef)) ?? [];
  const pattern = base === copied.ref ? copied.patterns[Number(index)] : undefined;
  assert(exact(item, patternCandidateKeys) && validRole(item) && object(pattern) &&
    patternSourceKeys.every(key => text(item[key]) && pattern[key] === item[key]), 'Invalid behavior entry ' + name + '.');
  const file = sites.indexed.get(item.path);
  assert(file?.kind === 'file' && file.sha256 === item.sha256,
    'Behavior entry ' + name + ' names a file that is not in the saved inventory: ' + item.path + '.');
}

function checkCandidate(sites: Sites, known: Map<string, unknown>, copied: CopiedPatterns, candidate: unknown,
  index: number): void {
  const name = 'candidate ' + index;
  const item = (object(candidate) ? candidate : {}) as Fields;
  if (item.found === 'knip-plugin-pattern') return checkPatternCandidate(sites, copied, item, name);
  const handler = item.handler as Fields | null;
  assert(exact(candidate, candidateKeys) && item.found === 'syntax-rule' && known.has(ruleKey(item)) && validRole(item) &&
    (item.name === null ? text(item.nameReason) : typeof item.name === 'string' && item.nameReason === null) &&
    (handler === null ? text(item.handlerReason) : object(handler) && validHandler(handler, known.get(ruleKey(item))) &&
      item.handlerReason === null),
  'Invalid behavior entry ' + name + '.');
  checkSite(sites, item, name);
  if (handler === null) return;
  assert(sites.indexed.get(handler.path)?.kind === 'file',
    'Behavior entry ' + name + ' names a handler file that is not in the saved inventory: ' + handler.path + '.');
  textAt(sites, handler.path, handler.range, 'Behavior entry ' + name + ' has a handler range');
}

// A settings gap is located like a candidate. A project gap names a compiler input that the snapshot does not hold.
function checkGap(sites: Sites, known: Map<string, unknown>, gap: unknown, index: number): void {
  const name = 'gap ' + index;
  const item = (object(gap) ? gap : {}) as Fields;
  const settingsGap = item.kind === 'unknown-settings-value';
  assert(settingsGap ? exact(gap, settingsGapKeys) && known.has(ruleKey(item)) && text(item.reason) : projectGap(gap),
    'Invalid behavior entry ' + name + '.');
  if (settingsGap) checkSite(sites, item, name);
}

// Checks the candidates record that the entry analysis names and returns the number of
// its candidates. `preflightRef` is the Stage 2 preflight record that the Knip receipts
// of the entry analysis name.
export function validateBehaviorCandidates(inputs: CandidateInputs, preflightRef: unknown): number {
  const { record, rules } = savedRecord(inputs, 'behavior-entry-candidates.json', label, 'The entry analysis names ' + inputs.ref +
    ' as its behavior entry candidates, which is not a saved candidates record.');
  // The kind of each rule of the saved list, by its ID, version and entry kind.
  const known = new Map(rules.map(rule => [ruleKey({ ruleId: rule.id, ruleVersion: rule.version, entryKind: rule.entryKind }),
    rule.kind]));
  const sites = sitesOf(inputs, label);
  const preflight = text(preflightRef) && inputs.artifacts.has(preflightRef) ? inputs.document(preflightRef) as Fields : undefined;
  const copied = { ref: preflightRef, patterns: Array.isArray(preflight?.pluginEntryPatterns) ? preflight.pluginEntryPatterns : [] };
  record.candidates.forEach((candidate, index) => checkCandidate(sites, known, copied, candidate, index));
  record.gaps.forEach((gap, index) => checkGap(sites, known, gap, index));
  return record.candidates.length;
}
