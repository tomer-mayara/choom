// The named Choom parsing profile for a snapshot without project settings. When
// the snapshot has no tsconfig*.json or jsconfig*.json file and the operator names
// no extra compiler settings, the Stage 1 settings record names this profile with
// its options and assumptions, and later stages parse the source with its options.
// A changed option or assumption needs a new profile version and ID.
export interface ParsingProfile {
  // The profile name with its version.
  readonly id: string;
  // The options as a tsconfig.json writes them.
  readonly declared: { readonly compilerOptions: Readonly<Record<string, boolean | string>> };
  // The same options as the TypeScript API parses them: the enum values of the
  // pinned TypeScript 6.0.2. Stage 4 and ts-morph take this form.
  readonly compilerOptions: Readonly<Record<string, boolean | number>>;
  // What the profile assumes about the project, in plain text.
  readonly assumptions: readonly string[];
}

// module: preserve and target: es2025 have a fixed meaning. esnext would change
// its meaning with each TypeScript version. es2025 is the newest ECMAScript
// edition that the pinned TypeScript names.
export const choomDefaultProfile: ParsingProfile = {
  id: 'choom-default-v1',
  declared: { compilerOptions: { allowJs: true, jsx: 'preserve', module: 'preserve', moduleResolution: 'bundler',
    target: 'es2025' } },
  compilerOptions: { allowJs: true, jsx: 1, module: 200, moduleResolution: 100, target: 12 },
  assumptions: [
    'The snapshot has no project settings. Choom chose these options. They are not settings of the project.',
    'JavaScript files are source files, and the parser reads them with the TypeScript files (allowJs: true).',
    'JSX stays as written (jsx: preserve). The profile assumes no JSX factory and no JSX runtime.',
    'Each import and each require stays as written, as a bundler or Bun reads them (module: preserve).',
    'Imports resolve as in a bundler (moduleResolution: bundler). The exports and imports fields of package.json apply, ' +
      'and a relative import can omit its file extension.',
    'The language level is ECMAScript 2025 (target: es2025). The default library of that level applies.',
    'The profile sets no path aliases, baseUrl, lib, types or strict options. It reads the source structure. It does not check types.',
  ],
};

const profiles = new Map<unknown, ParsingProfile>([[choomDefaultProfile.id, choomDefaultProfile]]);

// The parsing profile that a Stage 1 settings record names, or null when the
// record names none. A record of this producer names only a known profile.
export function namedParsingProfile(settings: Record<string, unknown>): ParsingProfile | null {
  const named = settings.parsingProfile ?? null;
  if (named === null) return null;
  const id = (named as { id?: unknown }).id;
  const profile = profiles.get(id);
  if (profile === undefined) throw new Error('The settings record names an unknown parsing profile: ' + String(id));
  return profile;
}
