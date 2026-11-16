import { type CandidateInputs, checkSite, projectGap, savedRecord, type Sites, sitesOf, textAt } from './record-candidates.ts';
import { assert, exact, type Fields, object, oneOf, text } from './record-checks.ts';

// The resource access candidates that the selected resource observations name: the
// record that Stage 4 collect saved, with the saved rule list and the saved source
// sites that it names. Each candidate names an indexed file with its inventory digest,
// its range lies in that saved file, and the text at the range starts with its
// expression; the range of its context lies in that file too. A rule match names a
// rule of the list, and a name-only candidate names a resource call site of the
// source sites. A candidate names no owner. A completed record holds each resource
// call site of the source sites.
const label = 'resource access';
const candidateKeys = ['ruleId', 'ruleVersion', 'library', 'resourceKind', 'operation', 'confidence', 'siteRef', 'path', 'sha256',
  'range', 'expression', 'truncated', 'name', 'nameReason', 'identity', 'context'];
const contextKeys = ['kind', 'name', 'range', 'graphContext'];
const ruleFields = ['library', 'resourceKind', 'operation'];
const resourceSite = 'resource-call-candidate';
// The checks of the record: its sites, the rules of its rule list by ID and version, and its saved source sites.
interface Checks { sites: Sites; rules: Map<string, Fields>; sourceSites: Fields[]; sourceSitesRef: string }

// A rule match names a rule of the saved list, with the library, the resource kind and
// the operation of that rule. A name-only candidate names no rule and names its site.
function matchesRule(rules: Map<string, Fields>, item: Fields): boolean {
  if (item.confidence === 'name-only') return ['ruleId', 'ruleVersion', ...ruleFields].every(key => item[key] === null) &&
    text(item.siteRef);
  const rule = rules.get(item.ruleId + ' ' + item.ruleVersion);
  return oneOf(['receiver-import', 'receiver-type'], item.confidence) && rule !== undefined &&
    ruleFields.every(key => item[key] === rule[key]) && (item.siteRef === null || text(item.siteRef));
}

// A name has the identity inferred-from-name; a null name has a reason and an unknown identity.
const named = (item: Fields): boolean => item.name === null ? text(item.nameReason) && item.identity === 'unknown'
  : typeof item.name === 'string' && item.nameReason === null && item.identity === 'inferred-from-name';

// The context is the module, or a function or a method with its name or null and its range.
function contextShape(context: unknown): boolean {
  const value = object(context) ? context : {};
  return exact(context, contextKeys) && text(value.graphContext) && (value.kind === 'module' ? value.name === null &&
    value.range === null : oneOf(['function', 'method'], value.kind) && (value.name === null || text(value.name)));
}

// The saved site that siteRef names is a resource call site of the same file with the same expression.
function checkSiteRef({ sourceSites, sourceSitesRef }: Checks, item: Fields, name: string): void {
  const prefix = sourceSitesRef + '#/sites/';
  const index = String(item.siteRef).startsWith(prefix) ? String(item.siteRef).slice(prefix.length) : '';
  const site = /^(?:0|[1-9][0-9]*)$/.test(index) ? sourceSites[Number(index)] : undefined;
  assert(site?.kind === resourceSite && site.path === item.path && site.sha256 === item.sha256 && site.expression === item.expression,
    'Resource access ' + name + ' names a source site that is not its saved site: ' + item.siteRef + '.');
}

// Checks a candidate and returns the source site that it names, or null.
function checkCandidate(checks: Checks, candidate: unknown, index: number): unknown {
  const name = 'candidate ' + index;
  const item = (object(candidate) ? candidate : {}) as Fields;
  assert(exact(candidate, candidateKeys) && matchesRule(checks.rules, item) && named(item) && contextShape(item.context),
    'Invalid resource access ' + name + '.');
  checkSite(checks.sites, item, name);
  const context = item.context as Fields;
  if (context.kind !== 'module') textAt(checks.sites, item.path, context.range, 'Resource access ' + name + ' has a context range');
  if (item.siteRef !== null) checkSiteRef(checks, item, name);
  return item.siteRef;
}

// Checks the candidates record that the resource observations name and returns the number of its candidates.
export function validateResourceCandidates(inputs: CandidateInputs): number {
  const { record, rules } = savedRecord(inputs, 'resource-access-candidates.json', label, 'The resource observations name ' +
    inputs.ref + ' as their resource access candidates, which is not a saved candidates record.');
  const sourceSitesRef = record.sourceSitesRef;
  const sourceSites = typeof sourceSitesRef === 'string' && inputs.artifacts.get(sourceSitesRef)?.path.endsWith('/source-sites.json')
    ? inputs.document(sourceSitesRef) as Fields : undefined;
  assert(sourceSites?.snapshotRef === inputs.snapshotRef && Array.isArray(sourceSites.sites),
    'The resource access candidates ' + inputs.ref + ' do not name their saved source sites.');
  const checks: Checks = { sites: sitesOf(inputs, label), rules: new Map(rules.map(rule => [rule.id + ' ' + rule.version, rule])),
    sourceSites: sourceSites.sites as Fields[], sourceSitesRef: sourceSitesRef as string };
  const siteRefs = new Set(record.candidates.map((candidate, index) => checkCandidate(checks, candidate, index)));
  record.gaps.forEach((gap, index) => assert(projectGap(gap), 'Invalid resource access gap ' + index + '.'));
  if (record.status === 'completed') checks.sourceSites.forEach((site, index) => {
    const ref = checks.sourceSitesRef + '#/sites/' + index;
    assert(site.kind !== resourceSite || siteRefs.has(ref), 'The resource access candidates ' + inputs.ref +
      ' leave out the resource call site ' + ref + ' of their source sites.');
  });
  return record.candidates.length;
}
