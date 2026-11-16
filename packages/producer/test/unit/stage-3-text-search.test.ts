import { describe, expect, test } from "bun:test";
import type { RipgrepRun } from "../../src/ripgrep.ts";
import type { IndexedFile } from "../../src/stage-3-inputs.ts";
import { parseRipgrepJson, ripgrepArgs, ripgrepResult, searchOutcome, textQuery, textSearchLimits }
  from "../../src/stage-3-text-search.ts";

// The arguments, the output parser and the outcome of the Stage 3 text search,
// with ripgrep JSON lines written by the test.
const root = "/runs/run-001/snapshot";
const digest = (letter: string): string => letter.repeat(64);
const files = new Map<string, IndexedFile>([
  ["README.md", { path: "README.md", kind: "file", bytes: 40, sha256: digest("a") }],
  ["deploy/worker.yaml", { path: "deploy/worker.yaml", kind: "file", bytes: 60, sha256: digest("b") }],
  ["link.ts", { path: "link.ts", kind: "symlink", bytes: 0, sha256: "" }],
]);
type RipgrepText = { text: string } | { bytes: string };
const message = (type: string, data: object): string => JSON.stringify({ type, data });
const text = (value: string): RipgrepText => ({ text: value });
const bytes = (value: Buffer): RipgrepText => ({ bytes: value.toString("base64") });
function match(path: string, line: number, lineText: RipgrepText, pathText = text(`${root}/${path}`)): string {
  return message("match", { path: pathText, lines: lineText, line_number: line, absolute_offset: 0, submatches: [] });
}
const begin = (path: string): string => message("begin", { path: text(`${root}/${path}`) });
const end = (path: string, matchedLines: number): string => message("end", { path: text(`${root}/${path}`), binary_offset: null,
  stats: { searches: 1, searches_with_match: 1, matched_lines: matchedLines, matches: matchedLines } });
const summary = (searches: number, matchedLines: number): string => message("summary", { elapsed_total: { secs: 0, nanos: 1 },
  stats: { searches, searches_with_match: matchedLines ? 1 : 0, matched_lines: matchedLines, matches: matchedLines } });
const output = (...lines: string[]): string => lines.map((line) => line + "\n").join("");
const parse = (stdout: string): ReturnType<typeof parseRipgrepJson> => parseRipgrepJson(stdout, root, files);
function run(change: Partial<RipgrepRun> = {}): RipgrepRun {
  return { exitCode: 1, signal: null, errorCode: null, errorMessage: null, stdout: Buffer.from(output(summary(2, 0))),
    stderr: Buffer.alloc(0), ...change };
}

describe("the ripgrep arguments of a text search", () => {
  const fixed = ripgrepArgs({ text: "scripts/worker.mjs", kind: "fixed-string" }, root);

  test("search the snapshot root as fixed text, as JSON, with no configuration file, in hidden and ignored files", () => {
    expect(fixed).toEqual(["--no-config", "--json", "--hidden", "--no-ignore", "--no-follow", "--no-search-zip",
      "--case-sensitive", "--line-number", "--sort=path", "--max-count=20", "--fixed-strings", "--regexp=scripts/worker.mjs",
      "--", root]);
  });

  test("use the query as a ripgrep pattern only when the operator asks for one", () => {
    const pattern = ripgrepArgs({ text: "work(er|s)", kind: "pattern" }, root);
    expect(pattern).not.toContain("--fixed-strings");
    expect(pattern).toContain("--regexp=work(er|s)");
  });

  test("never follow links or read compressed files", () => {
    for (const option of ["--follow", "-L", "--search-zip", "-z"]) expect(fixed).not.toContain(option);
    expect(fixed).toContain("--no-follow");
    expect(fixed).toContain("--no-search-zip");
  });

  test("give the snapshot root as the only path, after the end of the options", () => {
    const dash = ripgrepArgs({ text: "--files", kind: "fixed-string" }, root);
    expect(dash.slice(dash.indexOf("--"))).toEqual(["--", root]);
    expect(dash).toContain("--regexp=--files");
    expect(dash.filter((argument) => !argument.startsWith("-"))).toEqual([root]);
  });
});

describe("the query of a text search", () => {
  test("is fixed text, or a pattern when --pattern follows it", () => {
    expect(textQuery(["scripts/worker.mjs"])).toEqual({ text: "scripts/worker.mjs", kind: "fixed-string" });
    expect(textQuery(["work(er|s)", "--pattern"])).toEqual({ text: "work(er|s)", kind: "pattern" });
    expect(textQuery(["--pattern"])).toEqual({ text: "--pattern", kind: "fixed-string" });
  });

  test.each([[""], ["a\nb"], ["tab\there"], ["x".repeat(1001)]])("refuses %p", (query) => {
    expect(() => textQuery([query])).toThrow("Use a search text of 1 to 1000 characters without line breaks or other control characters.");
  });
});

describe("the ripgrep JSON parser", () => {
  test("turns each match into the indexed file, its digest, the line number and the line text", () => {
    expect(parse(output(begin("README.md"), match("README.md", 1, text("Run node scripts/worker.mjs.\n")), end("README.md", 1),
      begin("deploy/worker.yaml"), match("deploy/worker.yaml", 3, text("    command: node scripts/worker.mjs\r\n")),
      end("deploy/worker.yaml", 1), summary(2, 2)))).toEqual({
      matches: [
        { path: "README.md", sha256: digest("a"), line: 1, text: "Run node scripts/worker.mjs.", truncated: false, validUtf8: true },
        { path: "deploy/worker.yaml", sha256: digest("b"), line: 3, text: "    command: node scripts/worker.mjs", truncated: false,
          validUtf8: true },
      ],
      matchedLines: 2, searchedFiles: 2, filesAtMatchLimit: [] });
  });

  test.each([
    ["a path that the inventory does not list", match("extra.ts", 1, text("x\n"))],
    ["a symbolic link", match("link.ts", 1, text("x\n"))],
    ["a path outside the snapshot root", match("", 1, text("x\n"), text("/runs/run-001/other/README.md"))],
    ["a path that is not UTF-8", match("", 1, text("x\n"), bytes(Buffer.concat([Buffer.from(`${root}/README`), Buffer.from([0xff])])))],
  ])("refuses a match in %s", (_name, line) => {
    expect(() => parse(output(line, summary(2, 1)))).toThrow("Ripgrep matched a path that is not an indexed regular file: ");
  });

  test("reads a line that is not UTF-8 from its bytes and marks it", () => {
    const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x77, 0x6f, 0x72, 0x6b, 0x0a]);
    expect(parse(output(match("README.md", 2, bytes(latin1)), summary(2, 1))).matches).toEqual([
      { path: "README.md", sha256: digest("a"), line: 2, text: "caf� work", truncated: false, validUtf8: false }]);
  });

  test("cuts a long line at the line limit, but not inside a character", () => {
    const limit = textSearchLimits.maxLineCodeUnits;
    const [first] = parse(output(match("README.md", 1, text("x".repeat(limit + 10) + "\n")), summary(2, 1))).matches;
    expect({ length: first?.text.length, truncated: first?.truncated }).toEqual({ length: limit, truncated: true });
    const [second] = parse(output(match("README.md", 1, text("x".repeat(limit - 1) + "\u{1F600}y\n")), summary(2, 1))).matches;
    expect({ text: second?.text, truncated: second?.truncated }).toEqual({ text: "x".repeat(limit - 1), truncated: true });
  });

  test("keeps the first matches up to the record limit and counts all matched lines", () => {
    const lines = Array.from({ length: textSearchLimits.maxMatches + 5 }, (_, index) => match("README.md", index + 1, text("worker\n")));
    const search = parse(output(...lines, summary(2, lines.length)));
    expect({ kept: search.matches.length, matchedLines: search.matchedLines, last: search.matches.at(-1)?.line })
      .toEqual({ kept: textSearchLimits.maxMatches, matchedLines: lines.length, last: textSearchLimits.maxMatches });
  });

  test("lists each file that reached the per-file match limit", () => {
    const search = parse(output(begin("README.md"), match("README.md", 1, text("worker\n")), end("README.md", 20), summary(2, 1)));
    expect(search.filesAtMatchLimit).toEqual(["README.md"]);
  });

  test.each([
    ["output without a summary", output(match("README.md", 1, text("worker\n"))), "Ripgrep output has no summary."],
    ["a line that is not JSON", "not json\n" + output(summary(2, 0)), "Ripgrep printed an unexpected line 1."],
    ["a message of another type", output(message("context", { path: text(`${root}/README.md`) }), summary(2, 0)),
      "Unexpected ripgrep message: context"],
    ["a summary that counts other matches", output(match("README.md", 1, text("worker\n")), summary(2, 3)),
      "The ripgrep summary does not match its output."],
  ])("refuses %s", (_name, stdout, error) => {
    expect(() => parse(stdout)).toThrow(error);
  });
});

describe("the outcome of a text search", () => {
  const found = { path: "README.md", sha256: digest("a"), line: 1, text: "worker", truncated: false, validUtf8: true };

  test("is no-match without matches, and match when the record has every matched line", () => {
    expect(searchOutcome({ matches: [], matchedLines: 0, searchedFiles: 2, filesAtMatchLimit: [] })).toBe("no-match");
    expect(searchOutcome({ matches: [found], matchedLines: 1, searchedFiles: 2, filesAtMatchLimit: [] })).toBe("match");
  });

  test("is truncated when the record keeps only part of the matches or a file reached the per-file limit", () => {
    expect(searchOutcome({ matches: [found], matchedLines: 2, searchedFiles: 2, filesAtMatchLimit: [] })).toBe("truncated");
    expect(searchOutcome({ matches: [found], matchedLines: 1, searchedFiles: 2, filesAtMatchLimit: ["README.md"] }))
      .toBe("truncated");
  });
});

describe("a ripgrep run", () => {
  test("is read when ripgrep finished with exit code 0 or 1", () => {
    expect(ripgrepResult(run(), root, files)).toEqual({ matches: [], matchedLines: 0, searchedFiles: 2, filesAtMatchLimit: [] });
  });

  test.each([
    ["an exit code 2 with its message", { exitCode: 2, stderr: Buffer.from("rg: regex parse error:\nerror: unclosed group\n") },
      "Ripgrep failed with exit code 2: rg: regex parse error:\nerror: unclosed group"],
    ["output over the byte limit", { exitCode: null, signal: "SIGTERM", errorCode: "ENOBUFS", errorMessage: "spawnSync rg ENOBUFS" },
      "Ripgrep output exceeds 16 MiB. Search for a longer text or a narrower pattern."],
    ["a run over the time limit", { exitCode: null, signal: "SIGTERM", errorCode: "ETIMEDOUT", errorMessage: "spawnSync rg ETIMEDOUT" },
      "Ripgrep did not finish in 120 seconds."],
    ["a program that does not start", { exitCode: null, errorCode: "ENOENT", errorMessage: "spawnSync rg ENOENT" },
      "Cannot run ripgrep: spawnSync rg ENOENT"],
    ["a stop by a signal", { exitCode: null, signal: "SIGKILL" }, "Ripgrep stopped with signal SIGKILL."],
    ["exit code 0 without a match", { exitCode: 0 }, "Ripgrep exit code 0 does not match its output."],
  ])("is refused for %s", (_name, change, error) => {
    expect(() => ripgrepResult(run(change as Partial<RipgrepRun>), root, files)).toThrow(error);
  });
});
