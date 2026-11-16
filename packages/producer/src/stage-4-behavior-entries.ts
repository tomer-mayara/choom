import { binCandidates, binSnapshot, packageFiles } from './behavior-entry-bins.ts';
import { callCandidates, type EntryCandidate } from './behavior-entry-calls.ts';
import { behaviorEntryRulesPath } from './behavior-entry-rules.ts';
import { type SettingsGap, settingsCandidates, settingsRules } from './behavior-entry-settings.ts';
import { settingsRef } from './compiler-settings.ts';
import type { BehaviorEntryCallRule, BehaviorEntryPackageBinRule, BehaviorEntryRuleList, BehaviorEntrySettingsLiteralRule }
  from './generated/contracts.ts';
import { type Fields, object, text } from './record-checks.ts';
import { outsideReadsNote, type ProjectTools, virtualRoot } from './snapshot-project.ts';
import type { SnapshotFiles } from './stage-1-settings.ts';
import type { Picomatch, SourceFile } from './stage-4-graph-profile.ts';
import { pluginPatternCandidates, type PluginPatternSource } from './stage-4-plugin-entries.ts';
import { checkerTool, queryOptions } from './stage-4-references.ts';
import { readScope } from './stage-4-rule-scope.ts';

// The record of behavior entry candidates that Stage 4 collect saves. It applies the
// rule list that Stage 4 start saved to each source file of the graph scope, in the
// snapshot project of the graph group of the file, with the compiler settings of the
// group as the references action chooses them, and the package-bin rules to each
// package.json of the snapshot. It adds the files that the Knip plugin patterns of
// the Stage 2 profile select. A candidate is a place to read: a syntax rule or a
// plugin pattern found it, and it is not a proven entry. The role of a candidate
// comes from the role records of the Stage 1 review, the rule of the run for file roles.
export interface BehaviorEntryInput {
  attemptId: string; snapshotRef: unknown;
  // The indexed files of the saved snapshot and its folder, which the snapshot project reads.
  snapshot: SnapshotFiles;
  // The checked graph profile and its artifact ID, and the registered settings record.
  profile: Fields; profileRef: string; settings: Fields;
  // The rule list that Stage 4 start saved, its artifact ID and its SHA-256.
  rules: BehaviorEntryRuleList; rulesRef: string; rulesSha256: string;
  // The registered Stage 1 review and its artifact ID.
  review: Fields; reviewRef: string;
  // ts-morph and picomatch from the trusted checkout, and the parser record that collect saves with the source sites.
  tsMorph: ProjectTools; parser: Fields; picomatch: Picomatch; picomatchVersion: string;
  // The Knip plugin patterns that the Stage 2 profile copied.
  pluginPatterns: PluginPatternSource;
}
export interface FileRole { role: 'test' | 'unknown'; roleRef: string | null }
// Saves the candidates of a file, up to the limit of the record.
type SaveCandidates = (file: SourceFile, found: readonly EntryCandidate[]) => void;

// Stage 1 finish registers the review that holds the role records of the run with this ID.
export const stageOneReviewRef = 'review-001';
const candidateLimit = 10000;
// The role name of test files in the Stage 1 review, from the list of its cookbook.
const testRole = 'tests';

// What each record covers and what it does not, in the words of the record.
export const behaviorEntryNotes = [
  'A candidate is a call, a settings entry or a bin command that a Choom syntax rule found (found: syntax-rule), or a file ' +
    'that a Knip plugin pattern of the Stage 2 profile selects (found: knip-plugin-pattern). It is a place to read, not a ' +
    'proven entry: it does not show that the code runs, that the handler is reachable, or that the list is complete.',
  'The rules are the copy of ' + behaviorEntryRulesPath + ' that Stage 4 start saved (rulesRef and rulesSha256). Each later ' +
    'Stage 4 action refuses a tool checkout whose rule list differs from that copy.',
  'The scope is the source files of the graph profile (scope.files). Each file is read in the snapshot project of its graph ' +
    'group (scope.groups), with the compiler settings of the group, chosen as for the Stage 4 references action, and with ' +
    'allowJs. The call and settings-literal rules do not search files outside the scope. A package-bin rule reads each ' +
    'package.json of the inventory outside the node_modules folders.',
  'A call rule finds a call whose callee is its callPath on the value of its import. The type checker follows local names to ' +
    'the import: default, named, renamed and namespace imports, import =, require, variables that hold a value of the import ' +
    'or a part of it, and the imports and exports of other snapshot files. A function parameter, a later assignment and a call ' +
    'on the result of another call are not followed, so such calls are not candidates. Only the calls of the sameValueMethods ' +
    'of a rule are passed: they give the value that they are called on, such as the builder calls of a command. The default ' +
    'export, a namespace import and require of a module are one value, as for a CommonJS package.',
  'A call that does not have the arguments that the rule names is not a candidate. The name is an argument of the call at the ' +
    'nameCall of the rule, counted back from the call that the rule found, such as the command call before an action call; ' +
    'without nameCall, of the call that the rule found. A name is the text of a string literal or of a template literal ' +
    'without substitutions; any other name is null with nameReason. A function in the call is the handler, with its own range. ' +
    'A handler name resolves to its declaration after its aliases, as the Stage 4 references action follows them. Otherwise ' +
    'the handler is null with handlerReason.',
  'A settings-literal rule reads the settings object of a file of the scope that matches its fileGlob: export default, ' +
    'export = or module.exports =, through a call with one argument and the const declarations of the file. Each string ' +
    'literal at the end of its propertyPath, in an array there or as a property value of an object there, is a candidate. ' +
    'Each other value is a gap of kind unknown-settings-value. Nothing runs the file.',
  'A package-bin rule reads the bin field of a package.json as JSON text. Each path there is a candidate at its value, with ' +
    'the command name as npm installs it; each other value is a gap of kind unknown-settings-value. The handler is the whole ' +
    'file that the command runs, only with evidence (handler.evidence): snapshot-file when the snapshot holds the bin file, or ' +
    'compiler-output when a fully parsed configuration of settingsRef with outDir and rootDir compiles a source file of the ' +
    'snapshot that it selects to the bin file. Otherwise the handler is null with handlerReason.',
  'A knip-plugin-pattern candidate is an indexed file that a copied pattern of the registered Stage 2 preflight record ' +
    '(patternRef, in pluginEntryPatterns) selects in the folder of its workspace, with picomatch and dot files, as Knip ' +
    'globs. The pattern is a default of Knip 6.44.1 for a plugin that the dependency of the manifest turns on. A file of an ' +
    'inner workspace of the profile is left to the patterns of that workspace; a workspace that only Knip finds is not ' +
    'known. Knip runs no plugin and loads no settings file, so an entry that only a settings file names is a syntax-rule ' +
    'candidate or a gap. Knip may not read a selected file, such as a .vue file. These files are not graph roots.',
  'role is test when a role record of rolesRef whose roles include tests has a selector that is the exact path of the ' +
    'file or a folder that holds it, as the Stage 1 cookbook asks for exact file and directory selectors. roleRef names the ' +
    'first such record. A glob selector and another role name, such as test, give no test role. Otherwise role is unknown: ' +
    'the rules do not show whether the code is application or tooling code.',
  'A range starts at the first character and ends after the last character. Lines and columns start at 1 and count UTF-16 ' +
    'code units. A byte order mark is not counted. expression holds at most 4096 code units, and truncated says when it is ' +
    'shorter than the site. At most 10000 candidates are saved; omittedCandidates counts the others.',
  'gaps also lists each compiler input that the snapshot does not hold, as in the Stage 4 references record.',
  outsideReadsNote,
];

// The role of each file: test when a role record of the review whose roles include
// tests has a selector that is the exact path of the file or a folder that holds it,
// as the Stage 1 cookbook asks for exact file and directory selectors. A glob selector
// and another role name give no test role.
export function testRoles(review: Fields, reviewRef: string): (path: string) => FileRole {
  const records = (Array.isArray(review.roles) ? review.roles as unknown[] : []).flatMap((record, index) => {
    const { selector, roles } = object(record) ? record : {};
    if (!text(selector) || !Array.isArray(roles) || !roles.includes(testRole)) return [];
    const folder = selector.endsWith('/') ? selector : selector + '/';
    return [{ roleRef: reviewRef + '#/roles/' + index, selects: (path: string) => path === selector || path.startsWith(folder) }];
  });
  return path => {
    const found = records.find(record => record.selects(path));
    return found === undefined ? { role: 'unknown', roleRef: null } : { role: 'test', roleRef: found.roleRef };
  };
}

function savedCandidate(file: SourceFile, candidate: EntryCandidate, role: FileRole): Fields {
  const { ruleId, ruleVersion, entryKind, ...site } = candidate;
  return { ruleId, ruleVersion, entryKind, found: 'syntax-rule', ...role, path: file.path, sha256: file.sha256, ...site };
}

function savedGap(file: SourceFile, gap: SettingsGap): Fields {
  const { kind, ruleId, ruleVersion, entryKind, ...site } = gap;
  return { kind, ruleId, ruleVersion, entryKind, path: file.path, sha256: file.sha256, ...site };
}

// Saves the candidates of the package-bin rules in each package.json of the snapshot, in
// the order of the inventory, and returns their gaps.
function packageBins(input: BehaviorEntryInput, rules: readonly BehaviorEntryPackageBinRule[], save: SaveCandidates): Fields[] {
  if (!rules.length) return [];
  const snapshot = binSnapshot(input.snapshot, input.tsMorph, input.settings, settingsRef);
  const files = new Map(input.snapshot.files.filter(file => file.kind === 'file').map(file => [file.path, file]));
  return packageFiles([...files.keys()]).flatMap(path => {
    const file = files.get(path) as SourceFile;
    const findings = binCandidates(snapshot, path, rules);
    save(file, findings.candidates);
    return findings.gaps.map(item => savedGap(file, item));
  });
}

export function behaviorEntryRecord(input: BehaviorEntryInput): Fields {
  const { picomatch, profile } = input;
  const callRules = input.rules.rules.filter((rule): rule is BehaviorEntryCallRule => rule.kind === 'call');
  const settingRules = settingsRules(input.rules.rules
    .filter((rule): rule is BehaviorEntrySettingsLiteralRule => rule.kind === 'settings-literal'), picomatch);
  const binRules = input.rules.rules.filter((rule): rule is BehaviorEntryPackageBinRule => rule.kind === 'package-bin');
  const roleOf = testRoles(input.review, input.reviewRef);
  const candidates: Fields[] = [];
  let omittedCandidates = 0;
  const save: SaveCandidates = (file, found) => {
    for (const candidate of found) {
      if (candidates.length < candidateLimit) candidates.push(savedCandidate(file, candidate, roleOf(file.path)));
      else omittedCandidates++;
    }
  };
  const scope = readScope(input, (query, file) => {
    const settings = settingsCandidates(query, file.path, settingRules);
    save(file, [...callCandidates(query, file.path, callRules), ...settings.candidates]);
    return settings.gaps.map(item => savedGap(file, item));
  });
  const binGaps = packageBins(input, binRules, save);
  for (const candidate of pluginPatternCandidates(input.pluginPatterns, input.snapshot.files, picomatch, roleOf)) {
    if (candidates.length < candidateLimit) candidates.push(candidate);
    else omittedCandidates++;
  }
  return {
    formatVersion: 1, attemptId: input.attemptId, snapshotRef: input.snapshotRef, status: omittedCandidates ? 'partial' : 'completed',
    rulesRef: input.rulesRef, rulesSha256: input.rulesSha256, settingsRef, rolesRef: input.reviewRef,
    scope: { files: (profile.sourceFiles as SourceFile[]).map(file => file.path), groups: scope.groups }, queryOptions,
    tool: { ...input.parser, name: checkerTool, picomatch: input.picomatchVersion }, virtualRoot,
    candidates, omittedCandidates, gaps: [...scope.gaps, ...binGaps], outsideReads: scope.outsideReads, notes: behaviorEntryNotes,
  };
}
