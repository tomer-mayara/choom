# Baseline file input

[baseline-codec.tsp](baseline-codec.tsp) defines the decode-only operation.
[baseline.tsp](baseline.tsp) defines its model. The decoder recognizes the
format from `formatVersion`, not the file name. A supported baseline returns
its recorded values, statement statuses, and references without changing them.
A file with `schemaVersion: 1` and no `formatVersion` returns `invalid-document`
with a message that legacy diagrams are unsupported and a baseline is required.

The browser and native selected-file readers require valid UTF-8 and at most
16 MiB. A UTF-8 byte order mark, CRLF line endings, and non-ASCII text are
supported. Native reads keep their existing regular-file and identity checks.
The decoder receives text after that read boundary. It retains no source bytes
and does not scan source paths, open evidence, write files, or run an analyzer.

The shared strict YAML parser accepts one YAML 1.2 document with JSON-compatible
data and unique string mapping keys. It rejects directives, explicit tags,
anchors, aliases, non-finite numbers, and malformed syntax. It limits UTF-8
text to 16 MiB, collection depth to 32, structure nodes to 250,000, lexer tokens
to 1,500,000, flow commas to 250,000, and line breaks to 250,000. Each LF, bare
CR, or CRLF pair counts as one line break. The parser checks bounds before
model validation. See [documents.md](documents.md#yaml-encoding) for the shared
parser rules.

A numeric `formatVersion` other than 1 returns `unsupported-version`. Missing
or invalid model fields return `invalid-document`, with the field path when
available. YAML syntax and unsupported YAML constructs return
`invalid-encoding`; exceeded bounds return `limit-exceeded`. Error messages do
not contain raw input values, unknown field names, or parser exception text.
Every result includes a nonnegative duration in milliseconds. These local
results do not establish a production reliability or latency claim.

The viewer uses this decoder on both hosts. The legacy diagram codec was removed in BV-03.

Run the focused checks from the repository root:

```sh
bun run test:behavior:native --tags @bv-02
bun test ./test/unit/lib/baseline-yaml.test.ts
bun test ./test/interface/lib/baseline-yaml.test.ts ./test/interface/platform/documents.test.ts
bun test --preload ./test/preload.ts ./test/unit/platform/browser-documents.test.tsx
bun run test:rust
bun run check:contracts
bun run check:dependencies
```
