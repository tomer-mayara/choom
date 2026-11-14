# Baseline file reading

[baseline-codec.tsp](baseline-codec.tsp) owns decoding and
[baseline.tsp](baseline.tsp) owns the saved model.
[desktop-documents.tsp](desktop-documents.tsp) owns the native file wire
contract. Both hosts expose only selected-file reading; there is no
encoder, snapshot lifecycle, export, or download action in the viewer.

## YAML encoding

The [baseline decoder](baseline-codec.md) accepts one YAML 1.2 document with
JSON-compatible values. It requires unique string mapping keys and rejects
explicit tags, anchors, aliases, directives, non-finite numbers, and non-JSON
values. It enforces the byte, nesting, node, token, comma, and line-break limits
listed in that contract. No source, membership path, evidence reference, rule
expression, or analyzer-related record is executed or resolved while reading.

## Selected-file boundary

Both hosts require valid UTF-8 and at most 16 MiB. A successful read returns
the decoded text and `sha256`, a lowercase 64-character hexadecimal digest
of the original bytes. Both hosts compute the digest before decoding. A UTF-8
byte order mark and CRLF bytes count toward the limit and the digest. Browser
reading checks the File size before reading and the actual byte length afterward.
It supports non-ASCII content and uses Web Crypto in secure contexts, including
the local loopback development origin. An unreadable selected File returns a
safe error that tells the user to select it again.

The desktop adapter invokes only `document_file_read`. It requires an absolute
path of at most 4096 UTF-8 bytes, without controls or unpaired UTF-16 surrogates.
The native boundary checks its own platform's absolute path rules, the same byte
limit, and the absence of NUL. Rust strings already contain valid Unicode.
Native reading refuses non-regular files and final file or directory symlinks.
It opens files without write access and checks held file and directory identities
before and after reading. The read also checks size and modification metadata,
limits the bytes actually read, and rejects invalid UTF-8. The desktop adapter
validates the request and response, including the digest format. Native codes
such as `not-found`, `not-file`, `source-changed`,
`limit-exceeded`, and `invalid-utf8` retain useful fixed messages. Transport
rejections become `unavailable`; raw host errors and paths are not shown.

Validation and layout take place after reading. Neither failure writes the
selected file or changes the prior view. Retry uses the same selected file when
available. The workflow holds decoded model data and prepared layout; it does
not retain original bytes or make a native snapshot.

## Native read ownership

Each read owns its file handles until it returns. It needs no managed service,
snapshot, writable cache, startup cleanup, or shutdown cleanup. The native host
has no repository, analyzer, snapshot, export, or cleanup command. The read wire
stage remains `storage` for compatibility; it does not imply stored snapshots.
See the [viewer plan](../../docs/design/cr-baseline-viewer-plan.md) and the
[historical document record](../../docs/change-requests/CR-001-T06-evidence.md)
for the former app behavior.

The [shared native wire cases](../../test/fixtures/document-native.json) are
checked against generated schemas and by Rust. Both read paths run the same
[byte identity cases](../../test/fixtures/baseline-viewer/document-byte-identity.json)
with fixed hashes. Rust exercises the registered command and serialization
through Tauri's mock runtime. Installed acceptance exercises the native picker
and webview separately.

```sh
bun run test:behavior --tags @di-02-03
bun test ./test/interface/platform/documents.test.ts
bun run test:rust
```
