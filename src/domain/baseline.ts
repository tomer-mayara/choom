import { z } from "zod";
import { baselineDocumentationSchema, validateBaselineDocumentation } from "./baseline-documentation.ts";
import { baselineId as itemId, baselineStatement as statement, baselineText as text } from "./baseline-statements.ts";
import { baselineSourceUsageSchema, validateBaselineSourceUsage } from "./baseline-source-usage.ts";
import type { Baseline, BaselineRuleValue } from "./generated/contracts.ts";

function isSelector(value: string): boolean {
  const base = value.endsWith("/**") ? value.slice(0, -3) : value;
  return /\S/.test(base) && !/^[A-Za-z]:/.test(base)
    && !/[\\\u0000-\u001f\u007f?*\[\]{}]/.test(base)
    && base.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

const selector = text.refine(isSelector, { message: "Expected a safe relative path or a subtree ending in '/**'." });

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ruleChildren(value: Record<string, unknown> | unknown[]): unknown[] | undefined {
  if (Object.getOwnPropertySymbols(value).length > 0) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const array = Array.isArray(value);
  if (array && Object.keys(descriptors).length !== value.length + 1) return undefined;
  const children: unknown[] = [];
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (array && key === "length") continue;
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return undefined;
    if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) return undefined;
    children.push(descriptor.value);
  }
  return children;
}

function isRuleObject(value: unknown): value is Record<string, BaselineRuleValue> {
  if (!isRecord(value)) return false;
  const pending: { value: unknown; exit?: boolean }[] = [{ value }];
  const ancestors = new Set<object>();
  const complete = new Set<object>();
  while (pending.length > 0) {
    const entry = pending.pop();
    if (!entry) break;
    const current = entry.value;
    if (current === null || typeof current === "string" || typeof current === "boolean") continue;
    if (typeof current === "number") {
      if (!Number.isFinite(current)) return false;
      continue;
    }
    if (!Array.isArray(current) && !isRecord(current)) return false;
    if (entry.exit) {
      ancestors.delete(current);
      complete.add(current);
      continue;
    }
    if (ancestors.has(current)) return false;
    if (complete.has(current)) continue;
    const children = ruleChildren(current);
    if (!children) return false;
    ancestors.add(current);
    pending.push({ value: current, exit: true });
    for (const child of children) pending.push({ value: child });
  }
  return true;
}

const componentReference = statement(itemId.nullable());
const membership = z.strictObject({ paths: z.array(selector).min(1), excludePaths: z.array(selector).optional() });
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

export const baselineSchema = z.discriminatedUnion("formatVersion", [baselineV1, baselineV2, baselineV3])
  .superRefine(validateReferences).superRefine(validateBaselineDocumentation).superRefine(validateBaselineSourceUsage) satisfies z.ZodType<Baseline>;
