// The capture exclusion rules of a Stage 1 run, as rsync reads them from
// exclusions.txt with --exclude-from. Stage 1 start writes the default rules,
// and the operator can change them before capture. Choom reads only the rule
// forms that Stage 1 uses: a pattern with the wildcards * and ?, a leading /
// that anchors it to the target folder, a trailing / that limits it to folders,
// and a "- " prefix. Blank lines and lines that start with # or ; are comments.
// For another rule form, the result names that rule instead.
export type CaptureExclusions = { readable: true; excludes: (path: string) => boolean } | { readable: false; rule: string };
interface Rule { foldersOnly: boolean; pattern: RegExp }

export const defaultCaptureExclusions = '.*/\n.git\nnode_modules\n.env\n.env.*\n.npmrc\n.yarnrc*\n*.pem\n*.key\n' +
  '/dist/\n/coverage/\n/reports/\n/test-results/\n/target/\n/src-tauri/target/\n';

// An include rule or "!" changes which rule applies first; a character class,
// an escape, ** and a carriage return have meanings that Choom does not read.
const otherRuleForm = /^(?:\+ |!)|[[\\\r]|\*\*/;
const patternText = (char: string): string =>
  char === '*' ? '[^/]*' : char === '?' ? '[^/]' : char.replace(/[.+^${}()|\]]/, '\\$&');

// An unanchored pattern matches the end of a path at a folder boundary, as in rsync.
function readRule(rule: string): Rule | undefined {
  const foldersOnly = rule.endsWith('/');
  const anchored = rule.startsWith('/');
  const body = rule.slice(anchored ? 1 : 0, foldersOnly ? -1 : undefined);
  if (body === '' || body.startsWith('/') || body.endsWith('/')) return undefined;
  return { foldersOnly, pattern: new RegExp((anchored ? '^' : '(?:^|/)') + [...body].map(patternText).join('') + '$') };
}

// rsync does not enter an excluded folder, so a rule that matches a folder of the file also leaves the file out.
function excludedFile(rules: Rule[], path: string): boolean {
  const parts = path.split('/');
  return parts.some((_, index) => {
    const folder = index < parts.length - 1;
    const prefix = parts.slice(0, index + 1).join('/');
    return rules.some(rule => (folder || !rule.foldersOnly) && rule.pattern.test(prefix));
  });
}

// The rule lines of exclusions.txt, as written: every line that is not blank and not a comment.
export function captureExclusionRules(text: string): string[] {
  return text.split('\n').filter(line => line !== '' && !line.startsWith('#') && !line.startsWith(';'));
}

// Reads the rules. `excludes` tells if the rules leave out a file, given by its path relative to the target folder.
export function readCaptureExclusions(text: string): CaptureExclusions {
  const rules: Rule[] = [];
  for (const line of captureExclusionRules(text)) {
    const rule = otherRuleForm.test(line) ? undefined : readRule(line.startsWith('- ') ? line.slice(2) : line);
    if (rule === undefined) return { readable: false, rule: line };
    rules.push(rule);
  }
  return { readable: true, excludes: path => excludedFile(rules, path) };
}
