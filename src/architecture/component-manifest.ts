import { isCollection, parseDocument, visit } from "yaml";
import { z } from "zod";
import { DiscoveryProblem } from "./discovery-problem.ts";
import type { ComponentManifest } from "./generated/contracts";

const MANIFEST_TEXT_BYTES = 262_144;
const MAX_MANIFEST_ENTRIES = 128;
const MAX_YAML_DEPTH = 32;
const MAX_YAML_NODES = 10_000;
const MAX_ALIAS_COUNT = 50;
const textSchema = z.string().min(1);
const nameSchema = textSchema.refine((value) => value.trim().length > 0);
const artifactSchema = z.strictObject({ path: textSchema });
const architectureArtifactSchema = artifactSchema.extend({
  enforcer: textSchema.optional(),
  inputs: z.array(z.string()).max(MAX_MANIFEST_ENTRIES).optional(),
});

export const componentManifestSchema = z.strictObject({
  name: nameSchema,
  description: textSchema.optional(),
  artifacts: z.strictObject({
    behavior: z.array(artifactSchema).max(MAX_MANIFEST_ENTRIES).optional(),
    observability: z.array(artifactSchema).max(MAX_MANIFEST_ENTRIES).optional(),
    architecture: z.array(architectureArtifactSchema).max(MAX_MANIFEST_ENTRIES).optional(),
    contracts: z.array(artifactSchema).max(MAX_MANIFEST_ENTRIES).optional(),
  }).optional(),
  children: z.array(z.strictObject({ name: nameSchema, path: textSchema }))
    .max(MAX_MANIFEST_ENTRIES).optional(),
}) satisfies z.ZodType<ComponentManifest>;

export function readComponentManifest(text: string): ComponentManifest {
  if (new TextEncoder().encode(text).byteLength > MANIFEST_TEXT_BYTES) {
    throw new DiscoveryProblem("limit-exceeded", "A component manifest exceeds the text limit.");
  }
  const value = parseManifestYaml(text);
  const parsed = componentManifestSchema.safeParse(value);
  if (!parsed.success) {
    const tooManyEntries = parsed.error.issues.some((issue) => issue.code === "too_big");
    throw new DiscoveryProblem(tooManyEntries ? "limit-exceeded" : "invalid-manifest",
      tooManyEntries ? "A manifest list exceeds the entry limit." : "A manifest does not match the component format.");
  }
  return parsed.data;
}

function parseManifestYaml(text: string): unknown {
  try {
    const document = parseDocument(text, {
      schema: "core", version: "1.2", resolveKnownTags: false,
      uniqueKeys: true, stringKeys: true, merge: false, prettyErrors: false, logLevel: "error",
    });
    if (document.errors.length || document.warnings.length) {
      throw new DiscoveryProblem("invalid-manifest", "A manifest must contain one valid YAML document without custom tags or duplicate keys.");
    }
    let nodes = 0;
    visit(document, (_key, node, ancestry) => {
      nodes += 1;
      const depth = ancestry.filter(isCollection).length + (isCollection(node) ? 1 : 0);
      if (nodes > MAX_YAML_NODES || depth > MAX_YAML_DEPTH) {
        throw new DiscoveryProblem("limit-exceeded", "A manifest exceeds the YAML structure limit.");
      }
    });
    return document.toJS({ maxAliasCount: MAX_ALIAS_COUNT });
  } catch (error) {
    if (error instanceof DiscoveryProblem) throw error;
    const limit = error instanceof RangeError || (error instanceof ReferenceError && error.message.includes("alias count"));
    throw new DiscoveryProblem(limit ? "limit-exceeded" : "invalid-manifest",
      limit ? "A manifest exceeds the YAML expansion limit." : "A manifest could not be read as YAML.");
  }
}

export function isManifestReference(value: string): boolean {
  if (!value || value.startsWith("/") || value.startsWith("-")) return false;
  if (/[\\:\u0000-\u001f\u007f*?\[\]{};|&`$<>]/.test(value)) return false;
  try {
    encodeURIComponent(value);
    return new TextEncoder().encode(value).byteLength <= 4096;
  } catch {
    return false;
  }
}
