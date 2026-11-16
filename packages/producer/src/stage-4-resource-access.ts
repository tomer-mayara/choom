import type * as TsMorph from 'ts-morph';
import { located, type RuleQuery } from './call-rules.ts';
import { settingsRef } from './compiler-settings.ts';
import type { ResourceAccessRule, ResourceAccessRuleList } from './generated/contracts.ts';
import { assert, type Fields } from './record-checks.ts';
import { type AccessMatch, accessMatches, sourceContext } from './resource-access-calls.ts';
import { resourceAccessRuleList } from './resource-access-rules.ts';
import { outsideReadsNote, virtualRoot } from './snapshot-project.ts';
import type { SourceFile } from './stage-4-graph-profile.ts';
import { checkerTool, queryOptions } from './stage-4-references.ts';
import { readScope, type ScopeInput } from './stage-4-rule-scope.ts';
import { fileSites } from './stage-4-source-sites.ts';

// The record of resource access candidates that Stage 4 collect saves. It applies the
// rule list that Stage 4 start saved to each source file of the graph scope, as the
// behavior entry candidates read the scope, and keeps each resource call site of
// source-sites.json that no rule found, with confidence name-only. A candidate shows
// observed access syntax: a site, an operation and a name. It does not prove which
// resource the site uses, and the record names no owner of a resource.
export interface ResourceAccessInput extends ScopeInput {
  attemptId: string; snapshotRef: unknown;
  // The rule list that Stage 4 start saved, its artifact ID and its SHA-256.
  rules: ResourceAccessRuleList; rulesRef: string; rulesSha256: string;
  // The source sites that collect saved, and their artifact ID.
  sites: Fields; sitesRef: string;
  // The parser record that collect saves with the source sites.
  parser: Fields;
}
// The artifact ID of the source sites that collect saved, and the saved sites of each file with their index.
export interface SavedSites { ref: string; ofFile(path: string): { site: Fields; index: number }[] }
// The file of a candidate and the import pass of its graph group.
interface Where { path: string; sha256: string; graphContext: string }
type Node = TsMorph.ts.Node;

const candidateLimit = 10000;
const resourceSite = 'resource-call-candidate';
const nameOnlyReason = 'No resource access rule found this call. Only its name is on the list of resource call names of the ' +
  'source sites, so it can access a resource.';

// What each record covers and what it does not, in the words of the record.
export const resourceAccessNotes = [
  'A candidate is a call that a Choom resource access rule found (confidence receiver-import or receiver-type), or a ' +
    'resource call site of sourceSitesRef that no rule found (confidence name-only). It is a site to read, not proven ' +
    'resource access: it does not show that the code runs, and the list is not complete.',
  'The rules are the copy of ' + resourceAccessRuleList.path + ' that Stage 4 start saved (rulesRef and rulesSha256). ' +
    'Each later Stage 4 action refuses a tool checkout whose rule list differs from that copy.',
  'The scope is the source files of the graph profile (scope.files). Each file is read in the snapshot project of its graph ' +
    'group (scope.groups), with the compiler settings of the group, chosen as for the Stage 4 references action, and with ' +
    'allowJs. Files outside the scope are not searched.',
  'A rule finds a call whose callee is its callPath on the value of its import, as the behavior entry rules find it ' +
    '(receiver-import), or its typePath on a value whose declared type comes from the import (receiver-type): a parameter, ' +
    'a parameter property, a class or interface property, or a variable with a type annotation whose type reference ' +
    'leads, through the imports and exports and the type aliases of the snapshot files, to a type that the import exports. ' +
    'The snapshot holds no package types, so the type checker does not check the type itself. A call of the same method on ' +
    'another receiver is not a candidate of the rule.',
  'operation and resourceKind come from the rule. name is the text of a string literal or of a template literal without ' +
    'substitutions at the argument nameArgument of the call nameCall of the rule, counted back from the call that the rule ' +
    'found; any other name is null with nameReason. identity is inferred-from-name when the candidate has a name, and ' +
    'unknown otherwise: two sites with the same name need not use the same resource, and a name does not prove which ' +
    'resource a site uses. The record names no owner of a resource: ownership is a review decision.',
  'context is what the source shows, not a runtime trace: the function or the method that holds the call, with its name ' +
    'and range (kind function or method), or the module when no function holds it, such as a call at the top level or in a ' +
    'class field outside any function; and graphContext, the import pass of the graph group of the file.',
  'A rule does not find a call whose chain has another call between the value and the method, such as ' +
    'db(\'invoices\').where({ id }).update(row), a call on a member of a namespace import of a snapshot file, a call on a value ' +
    'that a later assignment gives, a value without a declared type, or a call outside the scope. Such a call is a candidate ' +
    'only when its name is on the list of resource call names of the source sites, with confidence name-only.',
  'siteRef names the site of sourceSitesRef of a call that is a resource call site there, else null. The name-only ' +
    'candidates come from the saved sites: when source-sites.json omitted sites after its limit, their calls are not here.',
  'A range starts at the first character and ends after the last character. Lines and columns start at 1 and count UTF-16 ' +
    'code units. A byte order mark is not counted. expression holds at most 4096 code units, and truncated says when it is ' +
    'shorter than the site. At most 10000 candidates are saved; omittedCandidates counts the others.',
  'gaps lists each compiler input that the snapshot does not hold, as in the Stage 4 references record.',
  outsideReadsNote,
];

// The source sites that collect saved, with their artifact ID, by file.
export function savedSites(record: Fields, ref: string): SavedSites {
  const byFile = new Map<unknown, { site: Fields; index: number }[]>();
  for (const [index, site] of (record.sites as Fields[]).entries()) {
    const sites = byFile.get(site.path) ?? [];
    sites.push({ site, index });
    byFile.set(site.path, sites);
  }
  return { ref, ofFile: path => byFile.get(path) ?? [] };
}

// The saved resource call sites of a file, by their node in the syntax tree of the type
// checker. Collect saved the sites of the file in the order of the same walk, so the
// n-th site of the walk is the n-th saved site of the file. A resource call site that
// does not match its saved site means that the two syntax trees differ, so the record stops.
function savedSiteRefs(ts: typeof TsMorph.ts, source: TsMorph.ts.SourceFile, path: string, sites: SavedSites): Map<Node, string> {
  const saved = sites.ofFile(path);
  const refs = new Map<Node, string>();
  fileSites(ts, source).forEach(({ node, site: [kind] }, order) => {
    const match = saved[order];
    if (match === undefined || (match.site.kind !== resourceSite && kind !== resourceSite)) return;
    const ref = sites.ref + '#/sites/' + match.index;
    assert(match.site.kind === kind && match.site.expression === located(source, node).expression,
      'The saved source site ' + ref + ' does not match the syntax tree of ' + path + '.');
    refs.set(node, ref);
  });
  return refs;
}

function ruleCandidate(match: AccessMatch, siteRef: string | null, { graphContext, ...file }: Where): Fields {
  const { rule, confidence, range, expression, truncated, name, nameReason, context } = match;
  return { ruleId: rule.id, ruleVersion: rule.version, library: rule.library, resourceKind: rule.resourceKind,
    operation: rule.operation, confidence, siteRef, ...file, range, expression, truncated, name, nameReason,
    identity: name === null ? 'unknown' : 'inferred-from-name', context: { ...context, graphContext } };
}

function nameOnlyCandidate(ts: typeof TsMorph.ts, node: Node, siteRef: string, { graphContext, ...file }: Where): Fields {
  return { ruleId: null, ruleVersion: null, library: null, resourceKind: null, operation: null, confidence: 'name-only', siteRef,
    ...file, ...located(node.getSourceFile(), node), name: null, nameReason: nameOnlyReason, identity: 'unknown',
    context: { ...sourceContext(ts, node), graphContext } };
}

// The candidates of one file of the scope, in source order: the calls of the rules,
// and the saved resource call sites that no rule found.
export function fileAccessCandidates(query: RuleQuery, file: SourceFile, rules: readonly ResourceAccessRule[], sites: SavedSites,
  graphContext: string): Fields[] {
  const { ts } = query;
  const matches = new Map<Node, AccessMatch[]>();
  for (const match of accessMatches(query, file.path, rules)) {
    const found = matches.get(match.call) ?? [];
    found.push(match);
    matches.set(match.call, found);
  }
  const source = query.program.getSourceFile(virtualRoot + '/' + file.path) as TsMorph.ts.SourceFile;
  const siteRefs = savedSiteRefs(ts, source, file.path, sites);
  const where = { path: file.path, sha256: file.sha256, graphContext };
  const candidates: Fields[] = [];
  const visit = (node: Node): void => {
    const found = matches.get(node) ?? [];
    for (const match of found) candidates.push(ruleCandidate(match, siteRefs.get(node) ?? null, where));
    const siteRef = siteRefs.get(node);
    if (found.length === 0 && siteRef !== undefined) candidates.push(nameOnlyCandidate(ts, node, siteRef, where));
    ts.forEachChild(node, visit);
  };
  visit(source);
  return candidates;
}

export function resourceAccessRecord(input: ResourceAccessInput): Fields {
  const candidates: Fields[] = [];
  let omittedCandidates = 0;
  const sites = savedSites(input.sites, input.sitesRef);
  const scope = readScope(input, (query, file, graphContext) => {
    for (const candidate of fileAccessCandidates(query, file, input.rules.rules, sites, graphContext)) {
      if (candidates.length < candidateLimit) candidates.push(candidate);
      else omittedCandidates++;
    }
    return [];
  });
  return {
    formatVersion: 1, attemptId: input.attemptId, snapshotRef: input.snapshotRef, status: omittedCandidates ? 'partial' : 'completed',
    rulesRef: input.rulesRef, rulesSha256: input.rulesSha256, settingsRef, sourceSitesRef: input.sitesRef,
    scope: { files: (input.profile.sourceFiles as SourceFile[]).map(file => file.path), groups: scope.groups }, queryOptions,
    tool: { ...input.parser, name: checkerTool }, virtualRoot,
    candidates, omittedCandidates, gaps: scope.gaps, outsideReads: scope.outsideReads, notes: resourceAccessNotes,
  };
}
