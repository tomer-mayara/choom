import type { BaselineV3 } from "../../src/domain/generated/contracts.ts";
import { sourceUsageBaseline } from "./source-usage-fixtures.ts";

/** Synthetic boundary data: 2,000 uses, 4,000 located notes, and exactly 2 MiB sourceUsage. */
export function sourceConsumerLimitBaseline(): BaselineV3 {
  const baseline: BaselineV3 = sourceUsageBaseline();
  const usage = baseline.sourceUsage;
  const assessment = usage?.assessments[0];
  const template = assessment?.uses[0];
  if (!usage || !assessment || !template) throw new Error("The source-use fixture needs one assessment and use.");
  baseline.id = "source-consumer-limits";
  assessment.scope = "Synthetic reader limit fixture. These source locations are saved test data and do not identify a real source review.";
  assessment.evidenceRefs = ["limit-caller-0"];
  assessment.uses = [];
  assessment.sourceNotes = [];
  for (let index = 0; index < 2000; index++) {
    const caller = `limit-caller-${index}`;
    const binding = `limit-binding-${index}`;
    assessment.uses.push({ ...template, id: `limit-use-${index}`, description: `Saved use ${index}.`, callerRef: caller, evidenceRefs: [caller, binding] });
    for (const [reference, kind] of [[caller, "caller"], [binding, "binding"]] as const) {
      assessment.sourceNotes.push({ evidenceRef: reference, description: `Saved ${kind} note ${index}.`,
        location: { snapshotRef: usage.snapshotRef, path: `source/${kind}-${index}.ts`, sha256: "a".repeat(64), lines: [index + 1, index + 2] } });
    }
  }
  const size = () => new TextEncoder().encode(JSON.stringify(usage)).byteLength;
  let remaining = 2 * 1024 * 1024 - size();
  for (const use of assessment.uses) {
    const count = Math.min(remaining, 8192 - new TextEncoder().encode(use.description).byteLength);
    if (count < 0) throw new Error("Source-use fixture exceeds its total budget.");
    use.description += "x".repeat(count);
    remaining -= count;
  }
  if (remaining !== 0 || size() !== 2 * 1024 * 1024) throw new Error("Source-use fixture must reach the exact byte budget.");
  return baseline;
}

/** Synthetic shared-evidence workload: 2,000 uses each cite the same 100 located notes. */
export function sourceConsumerFanoutBaseline(): BaselineV3 {
  const baseline = sourceUsageBaseline();
  const assessment = baseline.sourceUsage.assessments[0];
  const template = assessment?.uses[0];
  const callerNote = assessment?.sourceNotes[0];
  const bindingNote = assessment?.sourceNotes[1];
  if (!assessment || !template || !callerNote || !bindingNote) throw new Error("Missing source-use fixture records.");
  baseline.id = "source-consumer-fanout";
  assessment.scope = "Synthetic shared-evidence workload. These test records do not identify a real source review.";
  const refs = ["reviewed-caller", ...Array.from({ length: 99 }, (_, index) => `b${index}`)];
  assessment.sourceNotes = [callerNote, ...refs.slice(1).map((evidenceRef) => ({ ...bindingNote, evidenceRef }))];
  assessment.evidenceRefs = ["reviewed-caller"];
  assessment.uses = Array.from({ length: 2000 }, (_, index) => ({ ...template, id: `shared-use-${index}`, evidenceRefs: refs }));
  return baseline;
}
