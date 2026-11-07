import { z } from "zod";
import { isCanonicalRepositoryPath, validateComponentTree } from "./component-ownership.ts";
import type {
  AnalysisProvenance, ArchitectureComponent, ArchitectureDiagnostic, ComponentDeclaration,
  DiagnosticReference, ImportVariant,
} from "./generated/contracts";

const text = z.string().min(1);
export const filePathSchema = text.refine((value) => isCanonicalRepositoryPath(value), {
  message: "Expected a canonical repository-relative file path",
});
const directoryPathSchema = text.refine((value) => isCanonicalRepositoryPath(value, true), {
  message: "Expected a canonical repository-relative directory path",
});

const componentDeclarationSchema = z.strictObject({
  id: directoryPathSchema,
  name: text,
  parent: directoryPathSchema.optional(),
}) satisfies z.ZodType<ComponentDeclaration>;

export const componentDeclarationsSchema = z.array(componentDeclarationSchema).min(1).superRefine(validateComponentTree);
export const architectureComponentsSchema = z.array(componentDeclarationSchema.extend({
  reportedFiles: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}) satisfies z.ZodType<ArchitectureComponent>).min(1).superRefine(validateComponentTree);

export const analysisProvenanceSchema = z.strictObject({
  enforcer: text,
  version: text,
  config: filePathSchema,
  inputs: z.array(directoryPathSchema).min(1),
  generatedAt: z.iso.datetime({ offset: true }),
  scopeNotes: z.array(z.string()),
}) satisfies z.ZodType<AnalysisProvenance>;

export const importVariantSchema = z.strictObject({
  typeOnly: z.boolean().optional(),
  dynamic: z.boolean().optional(),
  preCompilationOnly: z.boolean().optional(),
}) satisfies z.ZodType<ImportVariant>;

const diagnosticReferenceFields = {
  kind: z.enum(["file", "folder", "package", "builtin", "unresolved", "outside-root"]),
  value: text,
};

function validateDiagnosticReference(reference: DiagnosticReference, context: z.RefinementCtx): void {
  const local = reference.kind === "file" || reference.kind === "folder";
  if (local && !isCanonicalRepositoryPath(reference.value, reference.kind === "folder")) {
    context.addIssue({ code: "custom", path: ["value"], message: "Diagnostic file and folder references must use canonical repository-relative paths" });
  }
  if (reference.kind === "outside-root" && /^(?:[A-Za-z]:|[/\\])/.test(reference.value)) {
    context.addIssue({ code: "custom", path: ["value"], message: "Outside-root references must use opaque identifiers, never absolute local paths" });
  }
}

const diagnosticReferenceSchema = z.strictObject(diagnosticReferenceFields).superRefine(validateDiagnosticReference);
const diagnosticSubjectSchema = z.strictObject({
  role: z.enum(["source", "target", "subject"]),
  ...diagnosticReferenceFields,
}).superRefine(validateDiagnosticReference);

function isFiniteMetricRecord(value: unknown): value is Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.values(value).every((metric) => typeof metric === "number" && Number.isFinite(metric));
}

// The record contract permits keys such as '__proto__'; keep them as own data properties.
const diagnosticMetricsSchema = z.custom<Record<string, number>>(isFiniteMetricRecord, {
  message: "Diagnostic metrics must be a record of finite numbers",
}).transform((metrics) => Object.fromEntries(Object.entries(metrics)));

export const architectureDiagnosticSchema = z.strictObject({
  code: text,
  severity: z.enum(["ignored", "info", "warning", "error"]),
  message: text,
  rule: text.optional(),
  subjects: z.array(diagnosticSubjectSchema),
  cycle: z.array(diagnosticReferenceSchema).optional(),
  via: z.array(diagnosticReferenceSchema).optional(),
  metrics: diagnosticMetricsSchema.optional(),
}) satisfies z.ZodType<ArchitectureDiagnostic>;
