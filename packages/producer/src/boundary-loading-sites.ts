import type { BoundaryAccessKind } from '@choom/baseline-model/contracts';
import type { ts as TS } from 'ts-morph';
import type { ProjectTools } from './snapshot-project.ts';
import type { FileSite } from './stage-4-source-sites.ts';

interface LoadingBinding { kind: BoundaryAccessKind; name?: TS.Node }

// A single statement can import both values and types. Preserve each binding separately.
export function loadingBindings(ts: ProjectTools['ts'], { node, site }: FileSite): LoadingBinding[] {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (!clause) return [{ kind: 'import' }];
    const kind = clause.isTypeOnly ? 'type' : 'import';
    const bindings: LoadingBinding[] = clause.name ? [{ kind, name: clause.name }] : [];
    const named = clause.namedBindings;
    if (named && ts.isNamedImports(named))
      bindings.push(...named.elements.map<LoadingBinding>((item) => ({ kind: item.isTypeOnly ? 'type' as const : kind, name: item.name })));
    else if (named) bindings.push({ kind });
    return bindings;
  }
  if (ts.isExportDeclaration(node)) {
    const kind = node.isTypeOnly ? 'type' : 're-export';
    const clause = node.exportClause;
    return clause && ts.isNamedExports(clause) ? clause.elements.map((item) =>
      ({ kind: item.isTypeOnly ? 'type' : kind, name: item.name })) : [{ kind }];
  }
  if (ts.isImportEqualsDeclaration(node)) return [{ kind: node.isTypeOnly ? 'type' : 'require' }];
  if (ts.isImportTypeNode(node)) return [{ kind: 'type', name: node.qualifier }];
  if (site[0] === 'dynamic-import') return [{ kind: 'dynamic-import' }];
  if (site[0] === 'require-candidate') return [{ kind: 'require' }];
  return [];
}
