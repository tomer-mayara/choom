import type { RefinementCtx } from "zod";
import type { ComponentDeclaration } from "./generated/contracts";

export function isCanonicalRepositoryPath(value: string, allowRoot = false): boolean {
  if (value === ".") return allowRoot;
  if (/^[A-Za-z]:|\\|[\u0000-\u001f\u007f]/.test(value)) return false;
  if (value.split("/").some((segment) => !segment || segment === "." || segment === "..")) return false;
  try {
    encodeURIComponent(value);
    return true;
  } catch {
    return false;
  }
}

export function isExternalFile(file: string): boolean {
  return file.split("/").includes("node_modules");
}

export function componentOwner(file: string, components: readonly ComponentDeclaration[]): string | undefined {
  if (isExternalFile(file)) return undefined;
  let owner: string | undefined;
  for (const component of components) {
    const contains = component.id === "." || file.startsWith(`${component.id}/`);
    if (contains && (owner === undefined || owner === "." || component.id.length > owner.length)) owner = component.id;
  }
  return owner;
}

export function importRelationshipId(source: string, target: string): string {
  return `imports:${encodeURIComponent(source)}:${encodeURIComponent(target)}`;
}

export function validateComponentTree(components: readonly ComponentDeclaration[], context: RefinementCtx): void {
  const byId = new Map(components.map((component) => [component.id, component]));
  const names = new Set<string>();
  const ids = new Set<string>();
  if (components.filter(({ id }) => id === ".").length !== 1) {
    context.addIssue({ code: "custom", message: "Components must have exactly one root with ID '.'" });
  }
  components.forEach((component, index) => {
    if (ids.has(component.id)) context.addIssue({ code: "custom", path: [index, "id"], message: "Component IDs must be unique" });
    if (names.has(component.name)) context.addIssue({ code: "custom", path: [index, "name"], message: "Component names must be unique" });
    ids.add(component.id);
    names.add(component.name);
    if (component.id === "." && component.parent !== undefined) {
      context.addIssue({ code: "custom", path: [index, "parent"], message: "The root component must not have a parent" });
    } else if (component.id !== "." && (component.parent === undefined || !byId.has(component.parent))) {
      context.addIssue({ code: "custom", path: [index, "parent"], message: "Nonroot components must reference a declared parent" });
    }
  });
  validateParentCycles(components, byId, context);
}

function validateParentCycles(
  components: readonly ComponentDeclaration[],
  byId: ReadonlyMap<string, ComponentDeclaration>,
  context: RefinementCtx,
): void {
  const checked = new Set(["."]);
  components.forEach((component, index) => {
    const chain = new Set<string>();
    let current: ComponentDeclaration | undefined = component;
    while (current && !checked.has(current.id)) {
      if (chain.has(current.id)) {
        context.addIssue({ code: "custom", path: [index, "parent"], message: "Component parents must form an acyclic tree rooted at '.'" });
        break;
      }
      chain.add(current.id);
      current = current.parent === undefined ? undefined : byId.get(current.parent);
    }
    for (const id of chain) checked.add(id);
  });
}
