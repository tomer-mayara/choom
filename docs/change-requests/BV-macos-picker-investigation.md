# macOS YAML picker investigation

## Result

On 2026-11-14 UTC, the user opened `baseline.yaml` manually in the unchanged
Choom app. The following UI observation showed **Baseline ready.** and
`baseline-004`. The user confirmed that the earlier disabled-Open report came
only from the agent's automated check, not from a separate manual failure.

This case does not establish a Choom file-filter defect. Automated native
selection still has an unresolved interaction limit. No product or dependency
change was retained. Permissions and macOS preferences were unchanged. The
correction is to the verification procedure: compare automated and manual
selection in the unchanged app before deciding whether the picker needs a fix.

## Environment and inputs

- macOS 27.0.1, build `26A434`, ARM64.
- Tauri dialog 2.8.4 and rfd 0.17.2.
- The original local `.app` executable SHA-256 was
  `2f3ad8188e014a9b2b07db04d6efd9492a52356a45835d524354d9b56a6f649c`.
- The original baseline SHA-256 was
  `272d7b251c6a853e462118a76f557ff1ab03e533e76175c5d78d26647233693a`.
- The report SHA-256 was
  `91096113028dea746b9860a2e0dd40241d5a5da08a02965cd1e6b8d41635dcb8`.

These hashes were unchanged after the investigation. The files were regular,
readable files. macOS identified both `.yaml` and `.yml` as declared
`public.yaml` types. The baseline and report came from the earlier Choom
assessment recorded in [CR-002 evidence](CR-002-evidence.md).

## Observations and rejected fixes

| Check | Observation |
| --- | --- |
| Original Choom, automated row selection and keyboard input | The YAML row was selected while Open remained disabled. One earlier attempt eventually opened the baseline without a source change. |
| Disposable AppKit diagnostic, YAML filter and no filter | Both modes could show the disabled state. Removing the filter did not establish a fix. |
| AppKit diagnostic, default and elevated window levels | One default-level attempt succeeded. This was a lead for a matched application comparison, not proof of a cause. |
| Matched Choom control and dependency-patched builds | Both failed the automated selection. Removing rfd's shielding-window-level call did not fix Choom; the patched attempt still showed disabled Open after about 234 seconds. |
| Original Choom, user selection with the mouse | Open worked. The agent then observed the loaded `baseline-004` in the app. |

The matched builds used source revision
`ddd78b91b39f89df61b83a03fc8e1aaa7d0edb44`, identical frontend bytes, and identical
bundle metadata and icons. Only the native executable differed. The control
executable SHA-256 was
`1ba7ff1d2223ac2f7c27f88fdc6ab4e42f9c2b86faf859fbf27ffd2ed1003674`;
the experimental executable SHA-256 was
`3d4fe87be385000874c1993805dd8e4b98efa7722e1cb7114278925e9abb0591`.
The experiment used a disposable dependency copy. It did not change the
checkout lockfile, installed registry source, or original app bundle.

Scoped system logs did not show a matching file-access denial. Recorded
file-provider startup and folder enumeration completed quickly. Logs contained
visibility transitions and remote-view warnings, but did not establish why
automated selection failed. Do not treat the absence of a logged denial as
proof that the panel was ready.

## Verification boundary

The successful manual case verifies baseline selection and loading in this
local macOS app bundle. It is not a passing full installed-app suite, a report
picker result, or evidence for other macOS versions. Report selection,
cancellation, invalid-file preservation, and the complete installed journey
still need their own platform observations.

Follow the [native picker procedure](BV-native-acceptance.md#macos-picker-automation-check)
for future agent-driven checks. Do not change filters, dependencies or system
settings solely because an automated row appears selected while Open is
disabled.
