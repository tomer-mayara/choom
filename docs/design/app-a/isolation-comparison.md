# Read an isolation comparison

Open the current fixed baseline with **Open Baseline**, then select **Compare with
earlier baseline**. The file you select second is Before. Record both snapshot
identities and original-byte digests. Different runs can use the same baseline ID.
Two working trees can have no known chronological order.

For each finding, name the caller, the actual member or dependency path, the
kind of access, the rule in effect and the effect on the caller. Inspect the
ordered path and the source notes in each file. For an addition, identify the
Before search that proves absence. For a removal, cite the corresponding After
search and any permitted replacement. Describe policy or ownership changes and
coverage limits separately. Use **Show non-production** to inspect the additional
roles and raw evidence.

## History starts loading configuration

Before already shows a component-level dependency on Configuration. Its
complete check finds no path from History to Loader. After contains a direct
import and a call to the loader, checked under the same effective rule. Report
one **New violation**, with the Before coverage and After sites. If Before
already proved an indirect route, the result is **Existing violation**. The
shorter path explains the change in evidence.

Try both cases with the [published After file](../../../test/fixtures/baseline-viewer/published-boundary-after.yaml).
Select the [complete Before file](../../../test/fixtures/baseline-viewer/published-boundary-before.yaml)
for the new violation. Replace Before with the [indirect route](../../../test/fixtures/baseline-viewer/published-boundary-indirect.yaml)
to inspect the existing violation.

## First observed with missing inputs

After proves History reaches the loader. Before omitted a relevant input or
had a reachable unresolved edge. Even when After lists the same limitation,
report **Comparison limited** and describe the violation as first observed.
An independently complete check can still date a different crossing. Use
**Close comparison** to return to the current file and its attachments.

With the same After file open, select the [unresolved Before file](../../../test/fixtures/baseline-viewer/published-boundary-unresolved.yaml).
Inspect the missing edge in the rule's coverage before dating the change.
