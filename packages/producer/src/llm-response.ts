// The design rule "Do not save hidden reasoning". Each stage that saves an LLM
// call record checks the saved response and the call record with these two
// checks before it saves them. The response must hold only the visible answer.
// The check cannot prove that nothing was left out; it refuses the forms that a
// copied reasoning block or a pasted raw provider response take.

// The names of the tags of a reasoning block. A name matches the start of a tag,
// so <thinking> and <thinking_summary> count. The short tag of open-weight models,
// <think>, must end after its name, so a word such as <thinker> is not a tag.
const tagNames = ['thinking', 'reasoning', 'redacted_thinking', 'think(?![\\w-])'];
// A line that starts, after optional white space, with an opening reasoning tag.
// White space includes tabs, a no-break space and a byte order mark.
const reasoningTag = new RegExp('^\\s*<(?:' + tagNames.join('|') + ')', 'i');
// The opening and the closing tag of each name, anywhere in a text.
const blockTags = tagNames.map(name => ({ opening: new RegExp('<' + name, 'i'), closing: new RegExp('</' + name + '\\s*>', 'i') }));
// A Markdown code fence: three or more backticks or tildes after at most three spaces.
const codeFence = /^ {0,3}(`{3,}|~{3,})/;
// Inline code: the text between two backticks on one line.
const inlineCode = /`[^`]*`/g;
// A line that holds one JSON object or array: alone, as in JSON Lines, or after
// the data field of a server-sent event stream.
const jsonLine = /^\s*(?:data:\s*)?([[{].*)$/;
// The types of the provider content blocks that hold hidden reasoning.
const reasoningTypes = new Set(['thinking', 'redacted_thinking', 'reasoning']);
// A JSON line can hold reasoning only when it contains one of these words.
const reasoningWord = /thinking|reasoning|"thought"/;

// True when a JSON value holds, anywhere, a reasoning content block or a part that
// the provider marks with `thought: true`. The walk uses a list, not recursion, so
// deep input cannot exhaust the call stack.
function holdsReasoning(value: unknown): boolean {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const item = pending.pop();
    if (item === null || typeof item !== 'object') continue;
    if (!Array.isArray(item)) {
      const { type, thought } = item as Record<string, unknown>;
      if ((typeof type === 'string' && reasoningTypes.has(type)) || thought === true) return true;
    }
    for (const child of Object.values(item)) pending.push(child);
  }
  return false;
}

// True when the whole text is one JSON object or array that holds reasoning.
function reasoningJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return false;
  }
  return holdsReasoning(value);
}

// True when a line holds one JSON object or array, alone or as the data of a stream
// event, that holds reasoning. Only a line with a reasoning word is parsed.
function reasoningJsonLine(line: string): boolean {
  const json = jsonLine.exec(line)?.[1];
  return json !== undefined && reasoningWord.test(json) && reasoningJson(json);
}

// True when a text holds a complete reasoning block: an opening tag and, after it,
// the closing tag of the same name. Each name needs two searches of the text.
function reasoningBlock(text: string): boolean {
  return blockTags.some(({ opening, closing }) => {
    const found = opening.exec(text);
    return found !== null && closing.test(text.slice(found.index));
  });
}

// True when the text outside the fenced code blocks holds hidden reasoning: a line
// that starts with a reasoning tag, a JSON line or a stream event that holds
// reasoning, or a complete reasoning block after other text. Inline code does not count.
function reasoningOutsideFences(response: string): boolean {
  const outside: string[] = [];
  let fence: string | undefined;
  for (const line of response.split(/\r\n|\r|\n/)) {
    const marker = codeFence.exec(line)?.[1];
    if (fence === undefined) {
      if (marker !== undefined) fence = marker;
      else if (reasoningTag.test(line) || reasoningJsonLine(line)) return true;
      else outside.push(line.replace(inlineCode, ''));
    } else if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) {
      fence = undefined;
    }
  }
  return reasoningBlock(outside.join('\n'));
}

// Refuses a saved response that holds a hidden reasoning block. `file` is the name
// of the saved response in the stage packet.
export function checkVisibleResponse(response: string, file: string): void {
  if (reasoningOutsideFences(response) || reasoningJson(response))
    throw new Error(file + ' contains a hidden reasoning block. Save only the visible response.');
}

// Refuses a call record that does not say that hidden reasoning was not saved.
// `file` is the name of the call record in the stage packet.
export function checkReasoningNotSaved(call: unknown, file: string): void {
  const record = call !== null && typeof call === 'object' && !Array.isArray(call) ? call as Record<string, unknown> : {};
  if (record.hiddenReasoning !== 'not-saved') throw new Error('Record hiddenReasoning: not-saved in ' + file + '.');
}
