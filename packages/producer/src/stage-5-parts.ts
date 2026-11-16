import { dividedFileBytes, type SavedFile } from './code-units.ts';
import { type Dependency, partDependencies } from './part-dependencies.ts';
import type { Fields } from './record-checks.ts';
import { nodeRange } from './snapshot-exports.ts';
import { checkSnapshotText } from './snapshot-project.ts';
import type { SyntaxTools } from './stage-5-syntax.ts';

// The record of the Stage 5 parts action: the parts of one file that named symbols
// divide, as the symbol selectors of a version 5 baseline would divide it, and the
// dependencies of the file at both levels. Each part holds the dependencies that
// belong to it, and the other dependencies stay at file level with a reason. A
// dependency names its loading site in the saved Stage 4 source sites, when a saved
// site matches. The action reads the checked bytes of the file only.
export interface PartsInput {
  // The fields that every Stage 5 record starts with.
  header: Fields;
  path: string;
  symbols: readonly string[];
  // The inventory record of the file, and the checked read of an indexed file of at most `limit` bytes.
  file: SavedFile;
  read(path: string, limit: number): Buffer;
  // The saved Stage 4 source sites and their artifact ID.
  sites: Fields;
  sitesRef: string;
  tools: SyntaxTools;
}

const partsTool = 'ts-morph project of the saved file (TypeScript type checker)';
const expressionLimit = 4096;
// What the record covers and what it does not, in the words of the record.
export const partsNotes = [
  'The symbols divide the file as the symbol selectors of a version 5 baseline do: one part for each symbol, in file order, ' +
    'and one rest part for all other text when there is other text. The ranges of the parts are the ranges that the code ' +
    'units of the divided file must have. A part names its code unit: the symbol unit of its symbol, or the rest unit.',
  'A dependency is a loading site of the file, as Stage 4 collect lists them in source-sites.json: an import, a re-export, an ' +
    'import =, an import type, a dynamic import, and a require or require.resolve call. A resource call is not a dependency. ' +
    'siteRef names the saved site, or is null when no saved site matches, such as after the site limit of collect.',
  'Each dependency is in one part or at file level, never in both and never in two parts. A site that binds local names (an ' +
    'import, an import = or a JavaScript require that the compiler reads as an import) belongs to the part that holds all the ' +
    'uses of those names; a type-only import follows the same rule. Any other site belongs to the part that holds it.',
  'reason says why a dependency stays at file level: shared, when the uses of its names are in several parts (usedIn lists ' +
    'them); unreferenced, when its names have no use; not-resolved, for an import that binds no name, such as import ' +
    '\'./setup\', which loads its module for its effects, and for a site with a computed module name, such as import(name) ' +
    'or require(name), which can load any module.',
  'The TypeScript type checker of a project that holds only the saved file finds the uses: a use is a name that refers to ' +
    'the local symbol of the site, so another declaration with the same name is not a use. The project reads no other file ' +
    'and resolves no import. A use without a name in the file, such as the JSX factory of JSX syntax or a type in a JSDoc ' +
    'comment, is not found.',
  'A use shows that the code of a part names the dependency. It does not show that the code runs, and the record does not ' +
    'name the owner of a part.',
  'A range starts at the first character and ends after the last character. Lines and columns start at 1 and count UTF-16 ' +
    'code units, as the code units do. An expression is clipped after 4096 code units, and truncated says so.',
];

// The saved site of a dependency: the site of the file at the same place in the order of the sites of the file,
// when it has the same kind and module name. Stage 4 collect walks the syntax tree of the file in the same order.
function savedSite(input: PartsInput): (dependency: Dependency) => string | null {
  const indexes = (input.sites.sites as Fields[]).flatMap((site, index) => site.path === input.path ? [index] : []);
  return ({ order, site: [kind, specifier] }) => {
    const index = indexes[order];
    const saved = index === undefined ? undefined : (input.sites.sites as Fields[])[index];
    return saved?.kind === kind && saved.specifier === specifier ? input.sitesRef + '#/sites/' + String(index) : null;
  };
}

// Divides the checked file by the symbols and saves its parts and the dependencies at both levels.
export function partsRecord(input: PartsInput): Fields {
  const { path, tools: { tsMorph, versions } } = input;
  const { source, checker } = checkSnapshotText(path, dividedFileBytes(path, input.file, input.read), tsMorph);
  const symbols = [...new Set(input.symbols)];
  const { parts, fileDependencies } = partDependencies({ ts: tsMorph.ts, checker }, source, symbols);
  const siteRef = savedSite(input);
  const entry = (dependency: Dependency): Fields => {
    const { node, site: [kind, specifier, typeOnly, dynamic], localNames } = dependency;
    const expression = node.getText(source);
    return { siteRef: siteRef(dependency), kind, specifier, typeOnly, dynamic, range: nodeRange(source, node),
      expression: expression.slice(0, expressionLimit), truncated: expression.length > expressionLimit, localNames };
  };
  return { ...input.header, path, sha256: input.file.sha256, symbols, sourceSitesRef: input.sitesRef,
    tool: { name: partsTool, tsMorph: versions.tsMorph, typescript: versions.typescript },
    parts: parts.map(({ part, ranges, dependencies }) => ({ ...part, ranges, dependencies: dependencies.map(entry) })),
    fileDependencies: fileDependencies.map(item => ({ ...entry(item), reason: item.reason,
      ...item.usedIn === undefined ? {} : { usedIn: item.usedIn } })),
    notes: partsNotes };
}
