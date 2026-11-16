// Source ranges as the producer records save them: 1-based lines and columns in
// UTF-16 code units, from the first character to the position after the last one.
export interface Position { line: number; column: number }

function position(text: string, offset: number): Position {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length, column: (lines.at(-1) ?? "").length + 1 };
}

// The range of a marked text in a file. « and » mark the range inside a part of the
// file that occurs once; without marks, the whole text is the range.
export function rangeIn(text: string, marked: string): [Position, Position] {
  const [first, last] = marked.includes("«") ? [marked.indexOf("«"), marked.indexOf("»") - 1] : [0, marked.length];
  const plain = marked.replace("«", "").replace("»", "");
  const found = text.indexOf(plain);
  if (found < 0 || text.indexOf(plain, found + 1) >= 0) throw new Error("The file has no unique text " + marked);
  return [position(text, found + first), position(text, found + last)];
}

// The text of a file at a list of ranges, joined in the order of the ranges. Lines
// end at LF; a CRLF line end keeps its CR at the end of its line.
export function textAt(text: string, ranges: readonly (readonly [Position, Position])[]): string {
  const lineStarts = [0, ...[...text.matchAll(/\n/g)].map((match) => match.index + 1)];
  const offset = ({ line, column }: Position): number => (lineStarts[line - 1] ?? Number.NaN) + column - 1;
  return ranges.map(([start, end]) => text.slice(offset(start), offset(end))).join("");
}
