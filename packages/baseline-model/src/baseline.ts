import { z } from "zod";
import { validateBoundaryReview } from "./boundary-references.ts";
import { boundaryReviewSchema } from "./baseline-boundaries.ts";
import { baselineDocumentationSchema, validateBaselineDocumentation } from "./baseline-documentation.ts";
import { baselineId as itemId, baselineStatement as statement, baselineText as text } from "./baseline-statements.ts";
import { baselineSourceUsageSchema, validateBaselineSourceUsage } from "./baseline-source-usage.ts";
import { baselineSystemEntryPointsSchema, validateBaselineSystemEntryPoints } from "./baseline-system-entry-points.ts";
import type { Baseline, BaselineRuleValue } from "./generated/contracts.ts";
import { isJsonData, isPlainRecord } from "./json-data.ts";

function isExactPath(value: string): boolean {
  return /\S/.test(value) && !/^[A-Za-z]:/.test(value)
    && !/[\\\u0000-\u001f\u007f?*\[\]{}#]/.test(value)
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function isSelector(value: string): boolean {
  return isExactPath(value.endsWith("/**") ? value.slice(0, -3) : value);
}

const selector = text.refine(isSelector, { message: "Expected a safe relative path or a subtree ending in '/**'." });
// ECMAScript IdentifierName characters. The check does not refuse reserved words, so `default` passes.
const symbolName = text.regex(/^[\p{ID_Start}$_][\p{ID_Continue}$\u200C\u200D]*$/u,
  "Expected a JavaScript identifier name, such as computePrice or default.");
const symbolSelector = z.strictObject({
  path: text.refine(isExactPath, { message: "Expected a safe relative file path. A symbol path cannot name a subtree." }),
  symbol: symbolName,
});

function isRuleObject(value: unknown): value is Record<string, BaselineRuleValue> {
  return isPlainRecord(value) && isJsonData(value);
}

const componentReference = statement(itemId.nullable());
const membership = z.strictObject({ paths: z.array(selector).min(1), excludePaths: z.array(selector).optional() });
const membershipV5 = z.strictObject({
  paths: z.array(selector), excludePaths: z.array(selector).optional(), symbols: z.array(symbolSelector).optional(),
}).superRefine(({ paths, symbols = [] }, context) => {
  if (paths.length === 0 && symbols.length === 0) {
    context.addIssue({ code: "custom", message: "A membership needs at least one path or symbol." });
  }
  const selectors = new Set<string>();
  symbols.forEach(({ path, symbol }, index) => {
    const key = JSON.stringify([path, symbol]);
    if (selectors.has(key)) context.addIssue({
      code: "custom", path: ["symbols", index], message: "Symbol selectors must be distinct within the component.",
    });
    selectors.add(key);
  });
});
const promises = z.strictObject({
  behavior: text.nullable(), data: text.nullable(), errors: text.nullable(), lifecycle: text.nullable(),
});
const consumers = z.array(itemId).min(1).refine((ids) => new Set(ids).size === ids.length, {
  message: "Allowed consumers must have distinct component IDs.",
});
// Zod's record parser drops '__proto__'. Keep all own JSON keys in recorded rule data.
const ruleObject = z.custom<Record<string, BaselineRuleValue>>(isRuleObject, {
  message: "Expected a JSON object with finite values and no cycles.",
}).transform((value, context) => {
  try {
    return structuredClone(value);
  } catch {
    context.addIssue({ code: "custom", message: "Rule data could not be copied." });
    return z.NEVER;
  }
}).nullable();

const component = z.strictObject({
  id: itemId, name: text, purpose: statement(text), membership: statement(membership),
  groupingReason: statement(text), parent: componentReference.optional(),
});
const componentV5 = component.extend({ membership: statement(membershipV5) });
const interfaceItem = z.strictObject({
  id: itemId, name: text, owner: componentReference, publicAccess: statement(z.array(text).min(1).nullable()),
  allowedConsumers: statement(consumers.nullable()), promises: statement(promises.nullable()),
});
const resource = z.strictObject({
  id: itemId, name: text, identity: statement(text.nullable()), owner: componentReference,
  accessRules: statement(text.nullable()),
});
const rule = z.strictObject({
  id: itemId, name: text, subject: statement(ruleObject), expected: statement(ruleObject), check: statement(ruleObject),
});

function validateParents(components: Baseline["components"], context: z.RefinementCtx): void {
  const indexed = new Map(components.map((item, index) => [item.id, { item, index }]));
  const complete = new Set<string>();
  for (const component of components) {
    const ancestors = new Set<string>();
    let cursor: string | null = component.id;
    while (cursor !== null && !complete.has(cursor)) {
      const entry = indexed.get(cursor);
      if (!entry) break;
      if (ancestors.has(cursor)) {
        context.addIssue({
          code: "custom", path: ["components", entry.index, "parent", "value"],
          message: "Component parents must not form a cycle.",
        });
        break;
      }
      ancestors.add(cursor);
      cursor = entry.item.parent?.value ?? null;
    }
    for (const id of ancestors) complete.add(id);
  }
}

function validateReferences(baseline: Baseline, context: z.RefinementCtx): void {
  if (baseline.parentId === baseline.id) context.addIssue({
    code: "custom", path: ["parentId"], message: "A baseline version cannot be its own parent.",
  });
  const ids = new Set<string>();
  const componentIds = new Set(baseline.components.map(({ id }) => id));
  for (const kind of ["components", "interfaces", "resources", "rules"] as const) {
    baseline[kind].forEach((item, index) => {
      if (ids.has(item.id)) context.addIssue({
        code: "custom", path: [kind, index, "id"], message: `Duplicate item ID: ${item.id}.`,
      });
      ids.add(item.id);
    });
  }
  function componentReference(id: string | null, path: (string | number)[]): void {
    if (id !== null && !componentIds.has(id)) context.addIssue({
      code: "custom", path, message: `Unknown component ID: ${id}.`,
    });
  }
  baseline.components.forEach((item, index) => {
    if (item.parent) componentReference(item.parent.value, ["components", index, "parent", "value"]);
  });
  for (const kind of ["interfaces", "resources"] as const) {
    baseline[kind].forEach((item, index) => componentReference(item.owner.value, [kind, index, "owner", "value"]));
  }
  baseline.interfaces.forEach((item, index) => {
    item.allowedConsumers.value?.forEach((id, consumerIndex) => {
      componentReference(id, ["interfaces", index, "allowedConsumers", "value", consumerIndex]);
    });
  });
  validateParents(baseline.components, context);
}

const baselineV1 = z.strictObject({
  formatVersion: z.literal(1), id: itemId, parentId: text.nullable(),
  components: z.array(component), interfaces: z.array(interfaceItem), resources: z.array(resource), rules: z.array(rule),
});
const baselineV2 = baselineV1.extend({
  formatVersion: z.literal(2), interfaces: z.array(interfaceItem.extend({ documentation: baselineDocumentationSchema.optional() })),
});
const baselineV3 = baselineV2.extend({ formatVersion: z.literal(3), sourceUsage: baselineSourceUsageSchema.optional() });
const baselineV4 = baselineV3.extend({ formatVersion: z.literal(4), systemEntryPoints: baselineSystemEntryPointsSchema.optional() });
const baselineV5 = baselineV4.extend({ formatVersion: z.literal(5), components: z.array(componentV5) });

const baselineV6 = baselineV5.extend({ formatVersion: z.literal(6), boundaryReview: boundaryReviewSchema });

export const baselineSchema = z.discriminatedUnion("formatVersion", [baselineV1, baselineV2, baselineV3, baselineV4, baselineV5, baselineV6])
  .superRefine(validateReferences).superRefine(validateBaselineDocumentation).superRefine(validateBaselineSourceUsage)
  .superRefine(validateBaselineSystemEntryPoints).superRefine(validateBoundaryReview) satisfies z.ZodType<Baseline>;
