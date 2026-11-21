import type { BaselineSourceLocation, BaselineSystemEntryPoint, BoundaryOperation, BoundaryUnit } from '@choom/baseline-model/contracts';
import type { EntryCandidate } from './behavior-entry-calls.ts';
import type { BoundarySourceBindings } from './boundary-source-bindings.ts';
import { object, type Fields } from './record-checks.ts';
import type { SourceRange } from './snapshot-references.ts';

interface BehaviorSite {
  kind: string; expression: string; source: { path: string; lines: number[] }; componentRef: string;
  fileEntryRefs: string[]; evidenceRefs: string[];
}
interface Candidate extends EntryCandidate { found: string; path: string }
interface RegistrationInputs {
  ruleSettings: Fields[]; behaviors: BehaviorSite[]; fileEntries: Fields[]; candidates: Candidate[]; systemEntries: BaselineSystemEntryPoint[];
}
interface OperationEvidence {
  operation: BoundaryOperation; unit: BoundaryUnit; notes: BaselineSourceLocation[]; compiler: BoundarySourceBindings;
}

function coversRange(lines: readonly number[], [start, end]: SourceRange): boolean {
  const lastLine = end.column === 1 && end.line > start.line ? end.line - 1 : end.line;
  return Number(lines[0]) <= start.line && lastLine <= Number(lines[1]);
}

export function registrationInputs(entry: Fields, systemEntries: BaselineSystemEntryPoint[], document: (ref: string) => unknown): RegistrationInputs {
  const saved = typeof entry.behaviorEntryCandidatesRef === 'string' ? document(entry.behaviorEntryCandidatesRef) : undefined;
  const rules = object(saved) && typeof saved.rulesRef === 'string' ? document(saved.rulesRef) : undefined;
  return { ruleSettings: object(rules) && Array.isArray(rules.rules) ? rules.rules : [], behaviors: entry.behaviorEntries as BehaviorSite[], fileEntries: entry.candidates as Fields[], systemEntries,
    candidates: object(saved) && Array.isArray(saved.candidates) ? saved.candidates as Candidate[] : [] };
}

function binOperation(inputs: RegistrationInputs, info: OperationEvidence, behavior: BehaviorSite): boolean {
  const { unit, operation, notes } = info;
  if (unit.unitKind !== 'file' || behavior.source.path !== unit.path || behavior.expression !== operation.member ||
    !['command', 'cli-bin'].includes(behavior.kind)) return false;
  const system = inputs.systemEntries.filter((item) => operation.systemEntryIds?.includes(item.id));
  if (system.length && !system.every((item) => item.path === unit.path && item.componentId === unit.ownerId &&
    item.evidenceRefs.some((ref) => operation.evidenceRefs.includes(ref)))) return false;
  return inputs.candidates.some((candidate) => {
    const handler = candidate.handler;
    return candidate.found === 'syntax-rule' && candidate.entryKind === 'cli-bin' && candidate.name === operation.member &&
      handler?.path === unit.path && notes.some((note) => note.path === candidate.path && coversRange(note.lines, candidate.range)) &&
      notes.some((note) => note.path === unit.path && coversRange(note.lines, handler.range)) && coversRange(behavior.source.lines, handler.range);
  });
}

function registeredCall(inputs: RegistrationInputs, info: OperationEvidence, behavior: BehaviorSite): boolean {
  const { operation, unit, notes, compiler } = info;
  return inputs.candidates.some((site) => {
    const handler = site.handler;
    if (site.found !== 'syntax-rule' || !site.name || !handler || handler.path !== unit.path || site.path !== behavior.source.path ||
      !coversRange(behavior.source.lines, site.range)) return false;
    const rule = inputs.ruleSettings.find((item) => item.kind === 'call' && item.id === site.ruleId &&
      item.version === site.ruleVersion && item.entryKind === site.entryKind);
    if (!rule) return false;
    const isRoute = site.entryKind === 'http-route' && ['route', 'http-route', 'http'].includes(behavior.kind);
    const isCommand = site.entryKind === 'cli-command' && ['command', 'cli-command'].includes(behavior.kind);
    if (!isRoute && !isCommand) return false;
    const method = String(rule.callPath).split('.').at(-1)?.toUpperCase();
    const name = isRoute ? method + ' ' + site.name : site.name;
    return operation.member === name && (behavior.expression === name || behavior.expression === site.expression) &&
      notes.some((note) => note.path === site.path && coversRange(note.lines, site.range)) &&
      notes.some((note) => note.path === handler.path && coversRange(note.lines, handler.range)) && compiler.callableHandler(unit, handler.range);
  });
}

// A behavior record is the reviewer's interpretation. Confirm its named command or test in the
// captured registration and handler, in the same role as its reviewed file entry.
export function registeredOperation(inputs: RegistrationInputs, info: OperationEvidence): boolean {
  const { operation, unit, notes, compiler } = info;
  return inputs.behaviors.some((behavior) => {
    if (behavior.source.path === unit.path && behavior.componentRef !== unit.ownerId ||
      !behavior.evidenceRefs.some((ref) => operation.evidenceRefs.includes(ref))) return false;
    const selected = inputs.fileEntries.filter((item) => item.path === behavior.source.path &&
      behavior.fileEntryRefs.includes(String(item.id)));
    const roles = selected.flatMap((item) => Array.isArray(item.roles) ? item.roles : []);
    if (roles.includes('application')) roles.push('production');
    if (!operation.roles.every((role) => unit.roles.includes(role) && roles.includes(role))) return false;
    if (operation.roles.length === 1 && operation.roles[0] === 'test' && behavior.kind === 'test')
      return compiler.testRegistration(behavior, unit, operation.member, notes);
    return binOperation(inputs, info, behavior) || registeredCall(inputs, info, behavior);
  });
}
