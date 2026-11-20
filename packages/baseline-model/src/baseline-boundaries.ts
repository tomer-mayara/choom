import { z } from "zod";
import {
  baselineBoundedDescriptionSchema as description, baselineBoundedIdSchema as id, baselineBoundedReferenceSchema as reference,
  baselineSourceLocationSchema as location, baselineSourcePathSchema as sourcePath,
} from "./baseline-documentation.ts";
import type { BaselineBoundaryReview, BaselineRuleObject } from "./generated/contracts.ts";
import { isJsonData, isPlainRecord } from "./json-data.ts";

const digest = z.string().regex(/^[0-9a-f]{64}$/, "Expected the lowercase SHA-256 digest of the original bytes.");
const commit = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/, "Expected a full Git commit ID.");
const root = z.union([z.literal("."), sourcePath]);
const role = z.enum(["production", "test", "development", "build", "ci", "benchmark", "example", "environment", "unknown"]);
const accessKind = z.enum(["import", "re-export", "dynamic-import", "require", "call", "type"]);
const distinct = (values: string[]): boolean => new Set(values).size === values.length;
const refs = z.array(reference).min(1).refine(distinct, "Evidence references must be distinct.");
const ids = z.array(id).refine(distinct, "Record references must be distinct.");
const roles = z.array(role).min(1).refine(distinct, "Roles must be distinct.");
const kinds = z.array(accessKind).refine(distinct, "Access kinds must be distinct.");
const settings = z.custom<BaselineRuleObject>(value => isPlainRecord(value) && isJsonData(value),
  "Expected JSON rule settings.").transform(value => structuredClone(value));

const identity = z.strictObject({
  projectKey: reference, snapshotRef: reference, inventoryDigest: digest,
  sourceKind: z.enum(["commit", "working-tree", "snapshot"]), baseCommit: commit.nullable(),
  analysisRoots: z.array(root).min(1).refine(distinct, "Analysis roots must be distinct."), mappingRef: reference,
  referenceDigest: digest.optional(),
}).superRefine((value, ctx) => {
  if ((value.sourceKind === "commit" && value.baseCommit === null) ||
      (value.sourceKind === "snapshot" && value.baseCommit !== null)) {
    ctx.addIssue({ code: "custom", path: ["baseCommit"], message: "The commit must agree with the captured source identity." });
  }
});
const componentScope = z.strictObject({
  componentId: id, name: description, purpose: description, roles,
  basis: z.enum(["declaration", "complete-review", "observed", "unknown"]), evidenceRefs: refs, reason: description.optional(),
});
const unit = z.strictObject({
  id, path: sourcePath, symbol: reference.optional(), unitKind: z.enum(["file", "symbol", "rest"]),
  ownerId: id.nullable(), stableId: reference.optional(), roles, purposeRoles: z.array(reference).optional(),
  generatedFromRef: reference.optional(), evidenceRefs: refs, reason: description.optional(),
});
const operation = z.strictObject({
  id, unitId: id, member: reference, name: description, stableId: reference.optional(), roles,
  visibility: z.enum(["public", "private", "unknown"]), interfaceId: id.optional(), entryId: id.optional(),
  systemEntryIds: ids.optional(), evidenceRefs: refs, reason: description.optional(),
});
const sourceUse = z.strictObject({ interfaceId: id, useId: id });
const copy = z.strictObject({ sourceRef: reference, emittedRef: reference, proofRef: reference });
const access = z.strictObject({
  id, callerUnitId: id, writtenPath: reference, targetUnitId: id.nullable(), member: reference.nullable(),
  operationId: id.optional(), kind: accessKind, context: reference, callerRole: role, targetRole: role,
  callerRef: reference, evidenceRefs: refs, sourceUse: sourceUse.optional(), emittedCopies: z.array(copy).optional(),
  reason: description.optional(),
});
const rule = z.strictObject({
  id, name: description, kind: z.enum(["reachability", "path", "visibility", "allowlist", "exception", "unsupported"]),
  authority: z.enum(["repository", "accepted", "proposed", "conflict"]), revision: reference, scope: description,
  settings, accessKinds: kinds, evidenceRefs: refs, statementRef: reference.optional(), acceptanceRef: reference.optional(),
  referenceDigest: digest.optional(), overridesRuleId: id.optional(),
});
const coverage = z.strictObject({
  status: z.enum(["complete", "partial", "unassessed"]), roots: z.array(root).refine(distinct),
  inventoryRoots: z.array(root).min(1).refine(distinct).optional(), examinedUnitIds: ids, accessKinds: kinds, missingRoots: z.array(root).refine(distinct), unresolvedAccessIds: ids,
  limitations: z.array(description),
});
const check = z.strictObject({
  id, ruleId: id, sourceUnitId: id, targetUnitId: id, context: reference, checker: reference, checkerVersion: reference,
  result: z.enum(["forbidden", "allowed", "absent", "unknown"]), accessIds: ids,
  coverage, evidenceRefs: refs, exceptionId: id.optional(),
});
const match = z.strictObject({
  referenceDigest: digest, oldPath: sourcePath, oldSymbol: reference.optional(), oldMember: reference.optional(),
  unitId: id, operationId: id.optional(), evidenceRefs: refs,
});
const search = z.strictObject({ operationId: id, role, coverage, evidenceRefs: refs });
const note = z.strictObject({ evidenceRef: reference, description, location });

export const boundaryReviewSchema = z.strictObject({
  status: z.enum(["current", "needs-refresh"]), identity, componentScopes: z.array(componentScope),
  units: z.array(unit), operations: z.array(operation), accesses: z.array(access).max(2000),
  rules: z.array(rule), checks: z.array(check), callerSearches: z.array(search),
  sourceNotes: z.array(note).max(4000), matches: z.array(match), limitations: z.array(description), statementRefs: refs.optional(),
}) satisfies z.ZodType<BaselineBoundaryReview>;
