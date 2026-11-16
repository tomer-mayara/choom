import { dirname, isAbsolute, join, relative, sep } from 'node:path';

const localRunFolder = 'work-choom';
export const localRunExclusion = '/' + localRunFolder + '/';

function contains(root, path) {
  const offset = relative(root, path);
  return offset !== '..' && !offset.startsWith('..' + sep) && !isAbsolute(offset);
}

export function pathsOverlap(first, second) {
  return contains(first, second) || contains(second, first);
}

export function runLayout(work, tools) {
  if (dirname(work) === join(tools, localRunFolder)) return 'checkout-local';
  if (!pathsOverlap(work, tools)) return 'separate';
  throw new Error('Use a separate working folder or a direct child of CHOOM_TOOLS/work-choom.');
}
