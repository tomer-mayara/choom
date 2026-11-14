import { assert } from './duplication-files.mjs';

// jscpd's report uses only maps, vectors, keywords, JSON strings and numbers.
// Reject the rest of EDN rather than introducing tagged values or evaluation.
export function readDetectorEdn(text) {
  let at = 0;
  let nodes = 0;
  const space = () => { while (/[\s,]/.test(text[at] ?? '') && at < text.length) at++; };
  function value(depth = 0) {
    assert(++nodes <= 250_000 && depth <= 32, 'EDN structure limit exceeded.');
    space();
    const char = text[at++];
    if (char === '{' || char === '[') {
      const result = char === '[' ? [] : Object.create(null);
      const end = char === '[' ? ']' : '}';
      space();
      while (text[at] !== end) {
        assert(at < text.length, 'Incomplete EDN report.');
        const item = value(depth + 1);
        if (Array.isArray(result)) result.push(item);
        else {
          assert(typeof item === 'string' && !Object.hasOwn(result, item), 'Invalid EDN map key.');
          result[item] = value(depth + 1);
        }
        space();
      }
      at++;
      return result;
    }
    if (char === '"') {
      const start = at - 1;
      while (at < text.length) {
        const next = text[at++];
        if (next === '\\') at++;
        else if (next === '"') return JSON.parse(text.slice(start, at));
      }
      throw new Error('Unclosed EDN string.');
    }
    at--;
    const token = /^[^\s,{}\[\]]+/.exec(text.slice(at))?.[0];
    assert(token, 'Invalid EDN value.');
    at += token.length;
    if (/^:[a-z][a-z0-9-]*$/.test(token)) return token.slice(1);
    if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(token)) {
      const number = Number(token);
      assert(Number.isFinite(number), 'Invalid EDN number.');
      return number;
    }
    throw new Error('Unsupported EDN value.');
  }
  const result = value();
  space();
  assert(at === text.length, 'Unexpected trailing EDN content.');
  return result;
}
