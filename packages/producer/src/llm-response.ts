// The design rule "Do not save hidden reasoning". Each stage that saves an LLM
// call record checks the saved response and the call record with these two
// checks before it saves them. The response must hold only the visible answer.
// The check cannot prove that nothing was left out; it refuses the forms that a
// copied reasoning block or a pasted raw provider response take.

// A line that starts, after optional spaces, with one of these opening tags.
const reasoningTag = /^[ \t]*<(?:thinking|reasoning|redacted_thinking)/i;
// A Markdown code fence: three or more backticks or tildes after at most three spaces.
const codeFence = /^ {0,3}(`{3,}|~{3,})/;
// The types of the provider content blocks that hold hidden reasoning.
const reasoningTypes = new Set(['thinking', 'redacted_thinking', 'reasoning']);

// True when a line outside the fenced code blocks starts with a reasoning tag.
function tagLine(response: string): boolean {
  let fence: string | undefined;
  for (const line of response.split(/\r\n|\r|\n/)) {
    const marker = codeFence.exec(line)?.[1];
    if (fence === undefined) {
      if (marker !== undefined) fence = marker;
      else if (reasoningTag.test(line)) return true;
    } else if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) {
      fence = undefined;
    }
  }
  return false;
}

// True when the whole response is a JSON object or array that holds a reasoning
// content block anywhere. The walk uses a list, not recursion, so deep input cannot
// exhaust the call stack.
function reasoningContent(response: string): boolean {
  const trimmed = response.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return false;
  }
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const item = pending.pop();
    if (item === null || typeof item !== 'object') continue;
    const type = Array.isArray(item) ? undefined : (item as Record<string, unknown>).type;
    if (typeof type === 'string' && reasoningTypes.has(type)) return true;
    for (const child of Object.values(item)) pending.push(child);
  }
  return false;
}

// Refuses a saved response that holds a hidden reasoning block. `file` is the name
// of the saved response in the stage packet.
export function checkVisibleResponse(response: string, file: string): void {
  if (tagLine(response) || reasoningContent(response))
    throw new Error(file + ' contains a hidden reasoning block. Save only the visible response.');
}

// Refuses a call record that does not say that hidden reasoning was not saved.
// `file` is the name of the call record in the stage packet.
export function checkReasoningNotSaved(call: unknown, file: string): void {
  const record = call !== null && typeof call === 'object' && !Array.isArray(call) ? call as Record<string, unknown> : {};
  if (record.hiddenReasoning !== 'not-saved') throw new Error('Record hiddenReasoning: not-saved in ' + file + '.');
}
