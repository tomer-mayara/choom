# Baseline file reading

[baseline-codec.tsp](baseline-codec.tsp) owns decoding and
[baseline.tsp](baseline.tsp) owns the saved model.
[desktop-documents.tsp](desktop-documents.tsp) retains the native file wire
contract. The frontend now exposes only selected-file reading; there is no
encoder, snapshot lifecycle, export, or download action in the viewer.

## YAML encoding

The [baseline decoder](baseline-codec.md) accepts one YAML 1.2 document with
JSON-compatible values. It requires unique string mapping keys and rejects
explicit tags, anchors, aliases, directives, non-finite numbers, and non-JSON
values. It enforces the byte, nesting, node, token, comma, and line-break limits
listed in that contract. No source, membership path, evidence reference, rule
expression, or analyzer-related record is executed or resolved while reading.

## Selected-file boundary

Both hosts require valid UTF-8 and at most 16 MiB. Browser reading checks the
File size before reading and the actual byte length afterward. It supports a
UTF-8 byte order mark, CRLF, and non-ASCII content. An unreadable selected File
returns a safe error that tells the user to select it again.

The desktop adapter invokes only `document_file_read`. Paths must be absolute,
at most 4096 UTF-8 bytes, and contain no controls or unpaired UTF-16 surrogates.
Native reading refuses non-regular files and final symlinks, bounds bytes, and
retains the existing identity and change checks. Requests and responses are
validated. Unknown fields, invalid text, or malformed responses cannot become
successful reads. Native codes such as `not-found`, `not-file`, `source-changed`,
`limit-exceeded`, and `invalid-utf8` retain useful fixed messages. Transport
rejections become `unavailable`; raw host errors and paths are not shown.

Validation and layout take place after reading. Neither failure writes the
selected file or changes the prior view. Retry uses the same selected file when
available. The workflow holds decoded model data and prepared layout; it does
not retain original bytes or make a native snapshot.

## Native write operations pending BV-07

The native service still implements snapshot create/read/release, export, and
cleanup commands, along with its current startup cleanup and storage ownership.
Their TypeSpec declarations, ACL permissions, and Rust behavior stay unchanged
through BV-03. The frontend has no callers for them. BV-07 removes those native
operations and permissions. See the [viewer plan](../../docs/design/cr-baseline-viewer-plan.md)
for that dependency and the [historical document record](../../docs/change-requests/CR-001-T06-evidence.md)
for the former app behavior.

The [shared native wire cases](../../test/fixtures/document-native.json) remain
checked against generated schemas and by Rust. Frontend conformance now checks
only the read operation. Installed baseline acceptance is separate from these
boundary tests. Local stage, code, and duration values do not establish a
production reliability or latency claim.
