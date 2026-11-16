import type * as TsMorph from 'ts-morph';
import type { SnapshotProject } from './snapshot-project.ts';

// The exports of one source file of the snapshot project, from the syntax of that
// file only. Each export statement, exported declaration or export list entry
// gives one export, in source order:
// - An exported declaration has the kind of the declaration. Function overloads
//   are one export. A variable statement gives one export for each name.
// - An anonymous default export is named default, and export = is named export=.
//   Their kind is that of the local declaration that they name, function or class
//   for a function or class expression, and expression for any other value.
// - An export list entry has the kind of the local declaration that it names, or
//   re-export for an imported name, with the module and the name in that module.
// - export ... from and export * from are re-exports. export * from is named *;
//   the names that it re-exports are in the other module, which this list does not read.
// typeOnly is true for a type-only export and false for a value. It is null when
// the export names a binding of another module without a type modifier: only that
// module shows whether the name is a type or a value.
type Ts = typeof TsMorph.ts;
type SourceFile = TsMorph.ts.SourceFile;
type Statement = TsMorph.ts.Statement;
export type ExportKind = 'function' | 'class' | 'interface' | 'type' | 'enum' | 'variable' | 'namespace' | 're-export' |
  'alias' | 'expression' | 'unknown';
// A position in the file: 1-based line and column, in UTF-16 code units, as in the other Stage 3 records.
export interface SourcePosition { line: number; column: number }
export interface ListedExport {
  name: string; kind: ExportKind; typeOnly: boolean | null;
  // From the first character of the export to the position after its last character.
  range: [SourcePosition, SourcePosition];
  // The local name that an export list entry, a default export or export = names.
  local?: string;
  // The module and the name in that module that a re-export names.
  from?: { module: string; name: string };
}
// What a name of the file means: its kind, whether it is only a type, and for an import the module it comes from.
interface Meaning { kind: ExportKind; typeOnly: boolean | null; from?: { module: string; name: string } }
interface Context {
  ts: Ts;
  range(node: TsMorph.ts.Node): [SourcePosition, SourcePosition];
  meaning(name: string, typeOnly: boolean): Meaning;
}

const unknownMeaning: Meaning = { kind: 'unknown', typeOnly: null };
const importedTypeOnly = (typeOnly: boolean): boolean | null => typeOnly ? true : null;

function moduleName(ts: Ts, specifier: TsMorph.ts.Expression): string {
  return ts.isStringLiteral(specifier) ? specifier.text : specifier.getText();
}

// A namespace is a value when it holds anything other than types and namespaces of types.
function instantiated(ts: Ts, declaration: TsMorph.ts.ModuleDeclaration): boolean {
  const body = declaration.body;
  if (body !== undefined && ts.isModuleDeclaration(body)) return instantiated(ts, body);
  if (body === undefined || !ts.isModuleBlock(body)) return false;
  return body.statements.some(statement => !ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement) &&
    !(ts.isModuleDeclaration(statement) && !instantiated(ts, statement)));
}

// The meaning of a top-level declaration, or undefined for a statement that declares no exportable name.
function declarationMeaning(ts: Ts, statement: Statement): Meaning | undefined {
  if (ts.isFunctionDeclaration(statement)) return { kind: 'function', typeOnly: false };
  if (ts.isClassDeclaration(statement)) return { kind: 'class', typeOnly: false };
  if (ts.isInterfaceDeclaration(statement)) return { kind: 'interface', typeOnly: true };
  if (ts.isTypeAliasDeclaration(statement)) return { kind: 'type', typeOnly: true };
  if (ts.isEnumDeclaration(statement)) return { kind: 'enum', typeOnly: false };
  if (ts.isVariableStatement(statement)) return { kind: 'variable', typeOnly: false };
  // A module with a string name and declare global declare names outside this file.
  if (ts.isModuleDeclaration(statement) && ts.isIdentifier(statement.name) && !(statement.flags & ts.NodeFlags.GlobalAugmentation))
    return { kind: 'namespace', typeOnly: !instantiated(ts, statement) };
  if (!ts.isImportEqualsDeclaration(statement)) return undefined;
  const reference = statement.moduleReference;
  if (ts.isExternalModuleReference(reference)) return { kind: 're-export', typeOnly: importedTypeOnly(statement.isTypeOnly),
    from: { module: moduleName(ts, reference.expression), name: '*' } };
  return { kind: 'alias', typeOnly: importedTypeOnly(statement.isTypeOnly) };
}

function bindingNames(ts: Ts, name: TsMorph.ts.BindingName): TsMorph.ts.Identifier[] {
  if (ts.isIdentifier(name)) return [name];
  return name.elements.flatMap(element => ts.isOmittedExpression(element) ? [] : bindingNames(ts, element.name));
}

// The name nodes of a top-level declaration.
function declaredNameNodes(ts: Ts, statement: Statement): TsMorph.ts.Identifier[] {
  if (ts.isVariableStatement(statement))
    return statement.declarationList.declarations.flatMap(declaration => bindingNames(ts, declaration.name));
  const name = (statement as { name?: TsMorph.ts.Node }).name;
  return name !== undefined && ts.isIdentifier(name) ? [name] : [];
}

// The names that a top-level declaration declares.
const declaredNames = (ts: Ts, statement: Statement): string[] => declaredNameNodes(ts, statement).map(name => name.text);

// The name nodes of the top-level declarations of a file, in source order. An
// import or an import = declaration names a declaration of another file.
export function topLevelNames(ts: Ts, source: SourceFile): TsMorph.ts.Identifier[] {
  return source.statements.flatMap(statement => {
    const meaning = declarationMeaning(ts, statement);
    return meaning === undefined || meaning.kind === 're-export' || meaning.kind === 'alias' ? [] : declaredNameNodes(ts, statement);
  });
}

// The names that an import declaration binds, with the module and the name in that module.
function importBindings(ts: Ts, statement: Statement): [string, Meaning][] {
  if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) return [];
  const clause = statement.importClause;
  const module = moduleName(ts, statement.moduleSpecifier);
  const clauseTypeOnly = clause.phaseModifier === ts.SyntaxKind.TypeKeyword;
  const imported = (name: string, typeOnly: boolean): Meaning =>
    ({ kind: 're-export', typeOnly: importedTypeOnly(typeOnly), from: { module, name } });
  const bindings: [string, Meaning][] = clause.name ? [[clause.name.text, imported('default', clauseTypeOnly)]] : [];
  const named = clause.namedBindings;
  if (named !== undefined && ts.isNamespaceImport(named)) bindings.push([named.name.text, imported('*', clauseTypeOnly)]);
  if (named !== undefined && ts.isNamedImports(named)) for (const element of named.elements)
    bindings.push([element.name.text, imported((element.propertyName ?? element.name).text, clauseTypeOnly || element.isTypeOnly)]);
  return bindings;
}

// The 1-based line and column of an offset in the text of a file.
export function sourcePosition(source: SourceFile, offset: number): SourcePosition {
  const { line, character } = source.getLineAndCharacterOfPosition(offset);
  return { line: line + 1, column: character + 1 };
}

// The range of a node of a file: from its first character to the position after its last character.
export function nodeRange(source: SourceFile, node: TsMorph.ts.Node): [SourcePosition, SourcePosition] {
  return [sourcePosition(source, node.getStart(source)), sourcePosition(source, node.end)];
}

function exportContext(ts: Ts, source: SourceFile): Context {
  const locals = new Map<string, Meaning[]>();
  const add = (name: string, meaning: Meaning): void => { locals.set(name, [...locals.get(name) ?? [], meaning]); };
  for (const statement of source.statements) {
    const meaning = declarationMeaning(ts, statement);
    if (meaning !== undefined) for (const name of declaredNames(ts, statement)) add(name, meaning);
    for (const [name, binding] of importBindings(ts, statement)) add(name, binding);
  }
  return {
    ts,
    range: node => nodeRange(source, node),
    // A name with several declarations: a value export takes the meaning of a value
    // first, and a type-only export the meaning of a type first.
    meaning(name, typeOnly) {
      const meanings = locals.get(name) ?? [];
      const preferred = typeOnly ? meanings.find(item => item.typeOnly !== false)
        : meanings.find(item => item.typeOnly === false) ?? meanings.find(item => item.typeOnly === null);
      const meaning = preferred ?? meanings[0] ?? unknownMeaning;
      return typeOnly ? { ...meaning, typeOnly: true } : meaning;
    },
  };
}

function listed(name: string, meaning: Meaning, range: ListedExport['range'], local?: string): ListedExport {
  return { name, kind: meaning.kind, typeOnly: meaning.typeOnly, range, ...local === undefined ? {} : { local },
    ...meaning.from === undefined ? {} : { from: meaning.from } };
}

function exportDeclarationExports({ ts, range, meaning }: Context, statement: TsMorph.ts.ExportDeclaration): ListedExport[] {
  const module = statement.moduleSpecifier === undefined ? undefined : moduleName(ts, statement.moduleSpecifier);
  const clause = statement.exportClause;
  if (module !== undefined && (clause === undefined || ts.isNamespaceExport(clause)))
    return [listed(clause === undefined ? '*' : clause.name.text,
      { kind: 're-export', typeOnly: importedTypeOnly(statement.isTypeOnly), from: { module, name: '*' } }, range(statement))];
  if (clause === undefined || !ts.isNamedExports(clause)) return [];
  return clause.elements.map(element => {
    const local = (element.propertyName ?? element.name).text;
    const typeOnly = statement.isTypeOnly || element.isTypeOnly;
    if (module !== undefined) return listed(element.name.text,
      { kind: 're-export', typeOnly: importedTypeOnly(typeOnly), from: { module, name: local } }, range(element));
    return listed(element.name.text, meaning(local, typeOnly), range(element), local);
  });
}

function assignmentExport({ ts, range, meaning }: Context, statement: TsMorph.ts.ExportAssignment): ListedExport {
  const name = statement.isExportEquals ? 'export=' : 'default';
  const value = statement.expression;
  if (ts.isIdentifier(value)) return listed(name, meaning(value.text, false), range(statement), value.text);
  const kind = ts.isArrowFunction(value) || ts.isFunctionExpression(value) ? 'function'
    : ts.isClassExpression(value) ? 'class' : 'expression';
  return listed(name, { kind, typeOnly: false }, range(statement));
}

// The exports of one top-level statement.
function statementExports(context: Context, statement: Statement): ListedExport[] {
  const { ts, range } = context;
  if (ts.isExportDeclaration(statement)) return exportDeclarationExports(context, statement);
  if (ts.isExportAssignment(statement)) return [assignmentExport(context, statement)];
  const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) ?? [] : [];
  const meaning = declarationMeaning(ts, statement);
  if (meaning === undefined || !modifiers.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) return [];
  if (modifiers.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword))
    return [listed('default', meaning, range(statement), declaredNames(ts, statement)[0])];
  return declaredNames(ts, statement).map(name => listed(name, meaning, range(statement)));
}

// Whether a statement is the next overload of the function that the previous statement declared.
function nextOverload(ts: Ts, previous: Statement | undefined, statement: Statement): boolean {
  return previous !== undefined && ts.isFunctionDeclaration(previous) && ts.isFunctionDeclaration(statement) &&
    previous.name?.text === statement.name?.text;
}

// The exports of an indexed source file of the project, in source order.
export function listExports(project: SnapshotProject, path: string): ListedExport[] {
  const source = project.sourceFile(path).compilerNode;
  const context = exportContext(project.ts, source);
  const exports: ListedExport[] = [];
  let previous: Statement | undefined;
  for (const statement of source.statements) {
    const found = statementExports(context, statement);
    const last = exports.at(-1);
    const [only] = found;
    if (last !== undefined && only !== undefined && found.length === 1 && only.name === last.name &&
      nextOverload(project.ts, previous, statement)) last.range = [last.range[0], only.range[1]];
    else exports.push(...found);
    previous = statement;
  }
  return exports;
}
