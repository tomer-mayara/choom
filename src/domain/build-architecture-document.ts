import { z } from "zod";
import { architectureDocumentSchema } from "./architecture-document.ts";
import { filePairKey, importVariant, importVariantKey } from "./architecture-order.ts";
import { analysisProvenanceSchema, architectureDiagnosticSchema, importVariantSchema } from "./architecture-shapes.ts";
import { filePathSchema, importRelationshipId, isExternalFile } from "./architecture-paths.ts";
import { ComponentCatalog } from "./component-catalog.ts";
import type {
  ArchitectureBuildInput, ArchitectureDocument, ComponentRelationship,
  ImportEvidence, ImportObservation, ImportVariant,
} from "./generated/contracts";

const architectureBuildInputSchema = z.strictObject({
  name: z.string().min(1),
  analysis: analysisProvenanceSchema,
  components: ComponentCatalog.declarationsSchema,
  observations: z.strictObject({
    files: z.array(filePathSchema),
    imports: z.array(z.strictObject({ sourceFile: filePathSchema, targetFile: filePathSchema, ...importVariantSchema.shape })),
    diagnostics: z.array(architectureDiagnosticSchema),
  }),
}) satisfies z.ZodType<ArchitectureBuildInput>;

function collectEvidence(observations: readonly ImportObservation[]): ImportEvidence[] {
  const pairs = new Map<string, { sourceFile: string; targetFile: string; variants: Map<string, ImportVariant> }>();
  for (const observation of observations) {
    const pair = filePairKey(observation.sourceFile, observation.targetFile);
    let evidence = pairs.get(pair);
    if (!evidence) {
      evidence = { sourceFile: observation.sourceFile, targetFile: observation.targetFile, variants: new Map() };
      pairs.set(pair, evidence);
    }
    evidence.variants.set(importVariantKey(observation), importVariant(observation));
  }
  return [...pairs.values()].map(({ sourceFile, targetFile, variants }) => ({ sourceFile, targetFile, variants: [...variants.values()] }));
}

function collectRelationships(
  observations: readonly ImportObservation[], catalog: ComponentCatalog, inventory: ReadonlySet<string>,
): ComponentRelationship[] {
  const groups = new Map<string, { source: string; target: string; observations: ImportObservation[] }>();
  for (const observation of observations) {
    if (isExternalFile(observation.sourceFile) || isExternalFile(observation.targetFile)) continue;
    // The inventory includes reference-only records; imports must not silently create unreported files.
    if (!inventory.has(observation.sourceFile) || !inventory.has(observation.targetFile)) {
      throw new Error("Internal import endpoints must be present in the reported file inventory");
    }
    const source = catalog.ownerOf(observation.sourceFile);
    const target = catalog.ownerOf(observation.targetFile);
    if (source === undefined || target === undefined) throw new Error("Internal files must have a declared component owner");
    if (source === target) continue;
    const id = importRelationshipId(source, target);
    const group = groups.get(id);
    if (group) group.observations.push(observation);
    else groups.set(id, { source, target, observations: [observation] });
  }
  return [...groups].map(([id, group]) => ({
    id, source: group.source, target: group.target, kind: "imports", evidence: collectEvidence(group.observations),
  }));
}

export function buildArchitectureDocument(input: ArchitectureBuildInput): ArchitectureDocument {
  const request = architectureBuildInputSchema.parse(input);
  const catalog = new ComponentCatalog(request.components);
  const inventory = new Set(request.observations.files.filter((file) => !isExternalFile(file)));
  const counts = new Map<string, number>();
  for (const file of inventory) {
    const owner = catalog.ownerOf(file);
    if (owner !== undefined) counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  return architectureDocumentSchema.parse({
    schemaVersion: 1,
    name: request.name,
    analysis: request.analysis,
    components: request.components.map((component) => ({ ...component, reportedFiles: counts.get(component.id) ?? 0 })),
    relationships: collectRelationships(request.observations.imports, catalog, inventory),
    diagnostics: request.observations.diagnostics,
  });
}
