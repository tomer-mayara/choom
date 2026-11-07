import { z } from "zod";
import {
  analysisProvenanceSchema, architectureComponentsSchema, architectureDiagnosticSchema,
  importVariantSchema,
} from "./architecture-shapes.ts";
import { canonicalArchitectureDocument, filePairKey, importVariantKey } from "./architecture-order.ts";
import { filePathSchema, importRelationshipId, isCanonicalRepositoryPath } from "./architecture-paths.ts";
import { ComponentCatalog } from "./component-catalog.ts";
import type { ArchitectureDocument, ComponentRelationship, ImportEvidence } from "./generated/contracts";

const importEvidenceSchema = z.strictObject({
  sourceFile: filePathSchema,
  targetFile: filePathSchema,
  variants: z.array(importVariantSchema).min(1),
}) satisfies z.ZodType<ImportEvidence>;

const componentRelationshipSchema = z.strictObject({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  kind: z.literal("imports"),
  evidence: z.array(importEvidenceSchema).min(1),
}) satisfies z.ZodType<ComponentRelationship>;

function validateEvidence(
  relationship: ComponentRelationship, catalog: ComponentCatalog,
  index: number, context: z.RefinementCtx,
): void {
  const pairs = new Set<string>();
  relationship.evidence.forEach((evidence, evidenceIndex) => {
    const path = ["relationships", index, "evidence", evidenceIndex];
    const pair = filePairKey(evidence.sourceFile, evidence.targetFile);
    if (pairs.has(pair)) context.addIssue({ code: "custom", path, message: "Import evidence file pairs must be unique" });
    pairs.add(pair);
    if (catalog.ownerOf(evidence.sourceFile) !== relationship.source || catalog.ownerOf(evidence.targetFile) !== relationship.target) {
      context.addIssue({ code: "custom", path, message: "Evidence file ownership must match its relationship endpoints" });
    }
    const variants = new Set(evidence.variants.map(importVariantKey));
    if (variants.size !== evidence.variants.length) {
      context.addIssue({ code: "custom", path: [...path, "variants"], message: "Import flag variants must be unique" });
    }
  });
}

function validateRelationships(document: ArchitectureDocument, context: z.RefinementCtx): void {
  const catalog = new ComponentCatalog(document.components);
  const ids = new Set<string>();
  const pairs = new Set<string>();
  document.relationships.forEach((relationship, index) => {
    const path = ["relationships", index];
    const pair = filePairKey(relationship.source, relationship.target);
    if (ids.has(relationship.id)) context.addIssue({ code: "custom", path, message: "Relationship IDs must be unique" });
    if (pairs.has(pair)) context.addIssue({ code: "custom", path, message: "Only one import relationship is allowed per ordered component pair" });
    ids.add(relationship.id);
    pairs.add(pair);
    if (!catalog.has(relationship.source) || !catalog.has(relationship.target)) {
      context.addIssue({ code: "custom", path, message: "Relationships must reference declared components" });
    }
    if (relationship.source === relationship.target) {
      context.addIssue({ code: "custom", path, message: "Import relationships must connect distinct components" });
    }
    const canonicalEndpoints = isCanonicalRepositoryPath(relationship.source, true) && isCanonicalRepositoryPath(relationship.target, true);
    if (canonicalEndpoints && relationship.id !== importRelationshipId(relationship.source, relationship.target)) {
      context.addIssue({ code: "custom", path: [...path, "id"], message: "Relationship ID must encode 'imports' and both escaped endpoints" });
    }
    validateEvidence(relationship, catalog, index, context);
  });
}

export const architectureDocumentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  name: z.string().min(1),
  analysis: analysisProvenanceSchema,
  components: architectureComponentsSchema,
  relationships: z.array(componentRelationshipSchema),
  diagnostics: z.array(architectureDiagnosticSchema),
}).superRefine(validateRelationships).transform(canonicalArchitectureDocument) satisfies z.ZodType<ArchitectureDocument>;
