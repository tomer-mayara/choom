import { z } from "zod";
import type { DuplicationReport } from "./generated/contracts.ts";
import { validateDuplicationSemantics } from "./duplication-semantics.ts";

export { duplicationFindingKey, matchesDuplicationBaseline, validateDuplicationBinding } from "./duplication-binding.ts";
export { resolveDuplicationRecordedFact } from "./duplication-facts.ts";

const encoder = new TextEncoder();

function boundedText(limit: number) {
  return z.string().regex(/\S/).max(limit).superRefine((value, context) => {
    if (encoder.encode(value).byteLength > limit) context.addIssue({
      code: "custom", message: `Text exceeds the ${limit}-byte UTF-8 limit.`, params: { reportLimit: true },
    });
  });
}

const text = boundedText(16_384);
const reference = boundedText(4_096);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const references = z.array(reference);
const endpointReference = z.strictObject({ interfaceId: reference, entryId: reference.optional() });
const endpoint = endpointReference.extend({ evidenceRefs: references.min(1) });
const endpoints = z.array(endpoint).length(2);
const topic = z.enum(["input", "success", "failures", "effects", "lifecycle"]);
const recordedFact = z.strictObject({
  endpoint: endpointReference, topic, basis: z.literal("recorded-contract"),
  field: z.enum([
    "promises.behavior", "promises.data", "promises.errors", "promises.lifecycle", "summary",
    "description", "signature", "kind", "interaction.input", "interaction.success", "interaction.failures", "interaction.effects",
  ]),
});
const sourceFact = z.strictObject({
  endpoint: endpointReference, topic, basis: z.literal("source-review"),
  state: z.enum(["known", "unknown", "not-applicable"]), value: text.nullable(), reason: text.nullable(), evidenceRefs: references,
}).superRefine((fact, context) => {
  const valid = fact.state === "known" ? fact.value !== null && fact.evidenceRefs.length > 0
    : fact.value === null && fact.reason !== null;
  if (!valid) context.addIssue({
    code: "custom", message: "Known facts need a value and evidence; unknown or inapplicable facts need a reason and no value.",
  });
});
const observation = z.strictObject({
  origin: z.enum(["jscpd-ast", "jscpd-token", "source-review"]), endpoints,
  score: z.number().min(0).max(1).nullable(), method: reference, toolVersion: reference.nullable(), evidenceRefs: references.min(1),
});
const review = z.strictObject({
  worker: reference, model: reference, settingsRef: reference, manager: reference,
  reviewedAt: reference, decisionRefs: references.min(1),
});
const source = z.strictObject({
  snapshotId: reference,
  path: reference.refine((path) => !/^[A-Za-z]:/.test(path) && !/[\\\u0000-\u001f\u007f]/.test(path)
    && path.split("/").every((part) => part !== "" && part !== "." && part !== ".."), "Expected a safe snapshot-relative path."),
  sha256: digest,
  lines: z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).length(2), evidenceRef: reference,
}).refine(({ lines }) => lines[0] !== undefined && lines[1] !== undefined && lines[0] <= lines[1], "Expected an inclusive source range in order.");
const finding = z.strictObject({
  id: reference, kind: z.enum(["interface-pair", "entry-pair"]), endpoints,
  observations: z.array(observation).min(1).max(100),
  status: z.enum(["needs-review", "potential-redundancy", "justified-distinction", "insufficient-evidence"]),
  overlap: text.nullable(), differences: z.array(text), rationale: text.nullable(), gaps: z.array(text),
  facts: z.array(z.discriminatedUnion("basis", [recordedFact, sourceFact])).max(100),
  evidenceRefs: references, counterevidenceRefs: references, sources: z.array(source).max(100),
  review: review.nullable(), recommendation: text.optional(),
});
const tool = z.strictObject({ name: reference, version: reference });
const scan = z.strictObject({
  status: z.enum(["completed", "partial", "failed", "skipped"]), profile: reference, tool,
  counts: z.strictObject({
    examined: count.nullable(), excluded: count.nullable(), unsupported: count.nullable(),
    helperOnly: count.nullable(), unmapped: count.nullable(),
  }),
  scopeRefs: references, diagnostics: z.array(text), mappingGaps: z.array(text), evidenceRefs: references,
});

export const duplicationReportSchema = z.strictObject({
  kind: z.literal("interface-duplication-review"), formatVersion: z.literal(1),
  id: reference, runRef: reference, createdAt: reference, producer: tool,
  baseline: z.strictObject({ id: reference, formatVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]), sha256: digest }),
  snapshot: z.strictObject({ id: reference, inventorySha256: digest }), scan,
  review: z.strictObject({
    status: z.enum(["pending", "partial", "completed"]), inspected: count, pending: count,
    scopeRefs: references, gaps: z.array(text),
  }),
  findings: z.array(finding).max(1_000),
}).superRefine(validateDuplicationSemantics) satisfies z.ZodType<DuplicationReport>;
