import type { Baseline } from "@choom/baseline-model/contracts";

/** Geometry and legacy record readers receive only components admitted by a current role review. */
export function productionBaseline(file: Baseline): Baseline {
  if (file.formatVersion !== 6) {
    return { formatVersion: file.formatVersion, id: file.id, parentId: file.parentId,
      components: [], interfaces: [], resources: [], rules: [] };
  }
  const review = file.boundaryReview;
  const scopes = new Map(review.componentScopes.filter((scope) => review.status === "current" && scope.roles.includes("production"))
    .map((scope) => [scope.componentId, scope]));
  const parents = new Map(file.components.map((item) => [item.id, item.parent?.value]));
  const components = file.components.flatMap((item) => {
    const scope = scopes.get(item.id);
    if (!scope) return [];
    let parent = item.parent?.value;
    while (parent && !scopes.has(parent)) parent = parents.get(parent);
    return [{ ...item, name: scope.name, purpose: { ...item.purpose, value: scope.purpose },
      parent: item.parent ? { ...item.parent, value: parent ?? null } : undefined }];
  });
  // Boundary panels read structured operations and uses. Older, free-text inventories have no independent role field.
  return { formatVersion: 6, id: file.id, parentId: file.parentId, components, interfaces: [], rules: [], resources: [], boundaryReview: review };
}
