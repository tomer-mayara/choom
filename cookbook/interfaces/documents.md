# Portable architecture documents

[documents.tsp](documents.tsp) owns the codec operations.
[desktop-documents.tsp](desktop-documents.tsp) owns native file operations.
The semantic payload remains [architecture.tsp](architecture.tsp); there is no
React Flow serialization format and no presentation data in version 1.

## YAML encoding

The shared encoder and decoder use YAML 1.2 with JSON-compatible data. A file
contains exactly one document. Mappings require unique string keys. Explicit
tags, anchors, aliases, directives, non-finite numbers, and non-JSON values are
rejected. Merge expansion is disabled; a literal metric key such as `<<` remains
ordinary data. Unknown semantic fields and unsupported schema versions fail.

Both operations enforce 16 MiB of UTF-8 text, collection depth 32, and 250,000
structure nodes. Keys and values count toward the structure limit. YAML text
may contain up to 1,500,000 lexer tokens, 250,000 flow commas, and 250,000 line
breaks. Each LF, bare CR, or CRLF pair counts as one line break. Flow commas
are collection separators, so commas inside scalar text count only as text.

The decoder checks text limits before constructing the syntax tree and
structure limits before composition. The encoder checks data before domain
validation and serialization, then checks the resulting text. Cycles,
accessors, sparse arrays, and non-plain objects cannot enter the encoder.
A parser or schema error does not include source text or native paths in its
message.

The existing domain validator checks references, ownership, counts, and other
graph rules. Collections may arrive in any order and are written in canonical
order. Ordered cycle and via paths retain their meaning. Only declared
components become components: `src/components/panel.ts` and `src/lib/format.ts`
can both belong to `src` without declaring either subdirectory. Full file-pair
evidence, reported-file counts, and diagnostic source/target roles survive a
round trip.

Analyzer provenance is data when opening YAML. Decoding performs no repository
lookup, analyzer execution, or layout. The codec does not guess which arbitrary
user text is a host path. Analyzer conversion must sanitize its own references
and descriptions before producing the semantic document.

## Candidate ownership

`DocumentFiles.prepareCandidate` encodes the model, asks native storage for a
unique snapshot, reads that snapshot, and uses the same decoder to validate what
was stored. Only then does it return a candidate. Cancellation or failure after
creation releases that owned snapshot before returning. Failed cleanup remains
a failure even if cancellation was requested.

Native storage retains at most two snapshots: the current snapshot and a new
candidate. IDs are opaque and valid only in their creating service session.
Release is idempotent for issued IDs. An impossible, foreign, or released ID
cannot be read. A failed cleanup retains its ownership and blocks new writes
until cleanup succeeds. A cleanup retry does not remove live snapshots.

Use the same `DocumentFiles` instance for a workspace's preparation, release, and
cleanup operations. It retains IDs when release is unconfirmed, including a
request that never reached native storage. New candidate writes and exports
wait for releases still in progress. A normal release in progress is not a
cleanup failure. If a release fails or remains unconfirmed, writes stay blocked
until cleanup succeeds. Concurrent release requests for one ID share the same
operation. `retryCleanup` waits for active releases, then retries retained
IDs before asking native storage to remove its pending files. An `invalid-request`
or `invalid-snapshot` rejection remains a failure result, but does not retain an
ID that native storage cannot own. Transport errors, invalid responses, and
cleanup failures retain the ID for a later retry.

Each application session owns a private cache directory and holds an OS file
lock. Startup cleanup removes recognized files only from inactive sessions.
Active sessions, unknown files, symlinks, and replaced identities are preserved.
Live-session cleanup uses retained file identities, not a scan that adopts new
files at old snapshot names. A moved owned file remains a cleanup failure until
its path is restored; a confirmed unlink can be released. Once known cleanup
finishes, the session lease is retired even if preserved files keep the directory
nonempty, so a later startup cannot adopt those files.
Startup cleanup failure is recorded rather than preventing the UI from opening;
the caller can retry it. Selected-file reads remain available.

Native writes use a temporary file and atomic promotion in the same directory.
There is no persistent current-document pointer, restart recovery, or native
view-commit operation. The load controller owns layout and the final synchronous
replacement of the displayed diagram. It releases failed candidates and
superseded snapshots through the file boundary.

## Opening and exporting files

`openSavedFile` reads a selected regular UTF-8 file and applies the common codec.
Native paths must be absolute and at most 4096 UTF-8 bytes. The platform also
rejects control characters and unpaired UTF-16 surrogates in selected paths.
File reads are bounded to 16 MiB. Non-regular files and final symlinks are refused. Opening an invalid
document never writes to the selected file.

Preparation and `exportDocument` capture encoded bytes before waiting for active
snapshot releases. An already cancelled preparation does not encode its input.
Export checks releases again after destination selection and replacement consent,
before writing. The final release check and write dispatch occur in the same turn.
`exportDocument` also captures these bytes before awaiting the destination chooser.
Later changes to the caller's document cannot change that export. Declining a
destination writes nothing. The native request requires an explicit `overwrite`
boolean: false uses an atomic operation that cannot replace an existing file;
true requires the user's replacement consent. A temporary file is written in
the destination directory before promotion. Any failure before promotion leaves
an existing destination unchanged. Export is independent of view replacement.

The running service retains a failed export temporary file for cleanup retry.
Startup cleanup covers the application cache only. After a crash, an export
temporary file in an arbitrary destination directory is not rediscovered; there
is no persistent export journal or search through user directories. These
operations do not promise power-loss durability or coordination with other
programs that change the destination.

Desktop composition first sends `overwrite: false`. If the destination exists,
it asks for explicit replacement consent through the
[diagram dialog operations](document-dialogs.tsp) and retries with the same
captured bytes. A save picker may also show the operating system's replacement
prompt; its returned path cannot prove consent for a file created afterward.
Declining the explicit prompt leaves the existing file unchanged. Failed cleanup
while that prompt is open prevents the replacement attempt.

Browser selection reads at most 16 MiB and requires valid UTF-8 before calling
the common decoder. Browser export downloads the same encoded semantic document
as `architecture.choom.yaml`; it does not need native storage or source files.

## Native boundary and observations

| Logical operation | Native command |
| --- | --- |
| `createDocumentSnapshot` | `document_snapshot_create` |
| `readDocumentSnapshot` | `document_snapshot_read` |
| `releaseDocumentSnapshot` | `document_snapshot_release` |
| `readDocumentFile` | `document_file_read` |
| `exportDocument` | `document_export` |
| `retryDocumentCleanup` | `document_cleanup` |

Commands are restricted to the local main window. Native storage preserves
bounded text; architecture validation belongs to the workspace codec. The
platform validates both sides of the TypeSpec boundary. Browser callers can use
the codec, but native file operations report unavailable. Workspace composition
binds browser file selection/download and desktop dialogs separately.

Results include a coarse stage where relevant, outcome, and duration in
milliseconds. Error codes have fixed messages. Host paths and raw I/O/parser
errors are not observations. The shared OpenSLO remains unmeasured; these local
results are not a production reliability or latency claim.
