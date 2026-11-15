import { isDeepStrictEqual as same } from 'node:util';
import { assert, type Fields, list, strings, text } from './record-checks.ts';

// The saved source graph that a Stage 4 or 5 entry analysis selects: its contexts
// must match the saved graph profile, and each saved traversal must follow from
// the retained edges.
export interface GraphInputs {
  graph: Fields;
  graphRef: unknown;
  profile: Fields;
  entry: Fields;
  indexed: Map<unknown, Fields>;
  resolve(ref: unknown): unknown;
  claim(id: unknown): void;
  evidence(record: unknown): void;
}

function checkSelection({ graph, graphRef, profile, entry, resolve }: GraphInputs): void {
  const contexts = graph.contexts as Fields[];
  assert(graph.formatVersion === 1 && graph.snapshotRef === entry.snapshotRef && graph.status === 'completed' &&
    graph.coverage === 'partial' && strings(graph.limits) && Array.isArray(graph.contexts) && contexts.length > 0 &&
    profile.formatVersion === 1 && profile.snapshotRef === entry.snapshotRef && Array.isArray(profile.contexts) &&
    same(contexts.map(context => context.id), (profile.contexts as Fields[]).map(context => context.id)),
  'Missing graph result or coverage limits.');
  resolve(graph.profileRef);
  const reachability = entry.reachability as Fields | undefined;
  assert(reachability?.status === 'assessed-with-limits' &&
    reachability.method === 'context-specific-source-graph-traversal' &&
    reachability.dependenciesRef === graphRef && text(reachability.reason) &&
    same(reachability.contexts, contexts.map(({ id }, index) => ({ id, resultRef: graphRef + '#/contexts/' + index + '/reachability' }))),
  'Entry analysis does not retain separate graph reachability contexts.');
}

// The saved edges by source file, after each edge passed its checks.
function retainedEdges(context: Fields, scope: Set<unknown>, inputs: GraphInputs): Map<unknown, Fields[]> {
  const outgoing = new Map<unknown, Fields[]>((context.scanFiles as unknown[]).map(path => [path, []]));
  for (const edge of list(context.edges, 'graph edges') as Fields[]) {
    inputs.claim(edge.id);
    assert(scope.has(edge.from) && text(edge.specifier) && Array.isArray(edge.dependencyTypes) &&
      edge.dependencyTypes.every(text) && [null, true, false].includes(edge.dynamic as boolean | null) &&
      [null, true, false].includes(edge.preCompilationOnly as boolean | null),
    'Invalid observed edge: ' + edge.id);
    const target = edge.targetKind === 'internal' ? scope.has(edge.to) :
      edge.targetKind === 'context-boundary' ? inputs.indexed.has(edge.to) && !scope.has(edge.to) :
        ['external', 'builtin', 'unresolved'].includes(edge.targetKind as string) && edge.to === null;
    assert(target, 'Invalid observed edge target: ' + edge.id);
    inputs.evidence(edge);
    (outgoing.get(edge.from) as Fields[]).push(edge);
  }
  return outgoing;
}

function checkTraversal(context: Fields, result: Fields, outgoing: Map<unknown, Fields[]>): void {
  const roots = result.roots as unknown[];
  const reached = new Set(roots);
  const queue = [...reached];
  const stopped: unknown[] = [];
  for (let position = 0; position < queue.length; position++) {
    for (const edge of outgoing.get(queue[position]) as Fields[]) {
      if (edge.targetKind !== 'internal') stopped.push(edge.id);
      else if (!reached.has(edge.to)) {
        reached.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  assert(same(result.reached, [...reached].sort()) &&
    same(result.notReached, (context.scanFiles as unknown[]).filter(path => !reached.has(path)).sort()) &&
    same(result.stoppedEdges, stopped.sort()), 'Saved traversal differs from the retained edges: ' + context.id);
}

function checkContext(context: Fields, input: Fields, contextIds: Set<unknown>, inputs: GraphInputs): void {
  assert(text(context.id) && !contextIds.has(context.id) && context.status === 'completed' &&
    context.coverage === 'partial' && strings(context.limits) && Array.isArray(context.scanFiles),
  'Missing or duplicate graph context: ' + context.id);
  assert(same([context.scanFiles, context.roots, context.compilerSettingsRef, context.conditionNames, context.moduleSystems],
    [input.sourceFiles, input.roots, input.compilerSettingsRef, input.conditionNames, input.moduleSystems]),
  'Graph context differs from its saved profile: ' + context.id);
  contextIds.add(context.id);
  const scope = new Set(context.scanFiles);
  assert(scope.size === context.scanFiles.length && [...scope].every(path => inputs.indexed.has(path)),
    'Invalid saved graph scope: ' + context.id);
  if (context.compilerSettingsRef !== null) inputs.resolve(context.compilerSettingsRef);
  const result = context.reachability as Fields | undefined;
  const roots = context.roots as Fields[];
  assert(result?.status === 'completed-with-limits' &&
    result.method === 'breadth-first traversal of retained internal source edges' &&
    result.edgePolicy === 'includes type-only, re-export, and literal-dynamic source dependencies; not runtime execution' &&
    Array.isArray(result.roots) && Array.isArray(result.reached) && Array.isArray(result.notReached) &&
    Array.isArray(result.stoppedEdges) && Array.isArray(context.roots) &&
    same(result.roots, roots.map(item => item.path)) &&
    result.roots.every(path => (result.reached as unknown[]).includes(path)), 'Incomplete saved reachability: ' + context.id);
  const accounted = [...result.reached, ...result.notReached];
  assert(accounted.length === scope.size && new Set(accounted).size === scope.size && accounted.every(path => scope.has(path)),
    'Reachability does not match its saved context: ' + context.id);
  roots.forEach(inputs.evidence);
  checkTraversal(context, result, retainedEdges(context, scope, inputs));
}

export function validateGraph(inputs: GraphInputs): void {
  checkSelection(inputs);
  const contextIds = new Set<unknown>();
  const inputContexts = inputs.profile.contexts as Fields[];
  for (const [index, context] of (inputs.graph.contexts as Fields[]).entries())
    checkContext(context, inputContexts[index] as Fields, contextIds, inputs);
}
