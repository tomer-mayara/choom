import { closeSync, constants, fstatSync, lstatSync, openSync, realpathSync, writeSync } from 'node:fs';
import { assert } from './record-checks.ts';

// Operations on the saved files of a Stage 3 or Stage 5 attempt: the review prompt
// of the cookbook that start saved, and the command log that each action extends.
const fence = '\x60\x60\x60';

// The review prompt of the saved stage cookbook: its one text block between the
// review prompt markers, with each {{TOKEN}} replaced. An unknown or unresolved
// token stops the action.
export function cookbookPrompt(cookbook: Buffer, stage: number, tokens: Record<string, unknown>): string {
  const body = cookbook.toString('utf8').replaceAll('\r\n', '\n');
  const pattern = new RegExp(`^<!-- stage${stage}-review-prompt:start -->\\n${fence}text\\n([\\s\\S]*?)^${fence}\\n` +
    `<!-- stage${stage}-review-prompt:end -->$`, 'gm');
  const blocks = [...body.matchAll(pattern)];
  assert(blocks.length === 1, `Expected one review prompt in the frozen Stage ${stage} cookbook.`);
  const prompt = ((blocks[0] as RegExpMatchArray)[1] as string).replace(/\{\{([^{}\n]+)\}\}/g, (_, token: string) => {
    assert(Object.hasOwn(tokens, token), 'Unknown review prompt token: ' + token);
    return tokens[token] as string;
  });
  assert(!prompt.includes('{{'), 'Unresolved token in review prompt.');
  return prompt;
}

// Appends one entry to the command log of an attempt as a JSON block. The log must
// be a canonical regular file, and the write must be complete.
export function appendCommandLog(path: string, entry: unknown): void {
  assert(lstatSync(path).isFile() && realpathSync(path) === path, 'Expected a canonical command log.');
  const fd = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    assert(fstatSync(fd).isFile(), 'Expected a regular command log.');
    const bytes = Buffer.from('\n' + fence + 'json\n' + JSON.stringify(entry) + '\n' + fence + '\n');
    assert(writeSync(fd, bytes) === bytes.length, 'Incomplete command log write.');
  } finally {
    closeSync(fd);
  }
}
