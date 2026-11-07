import { z } from "zod";
import { directoryPathSchema, isExternalFile } from "./architecture-paths.ts";
import type { ComponentDeclaration } from "./generated/contracts";

export class ComponentCatalog {
  static readonly declarationSchema = z.strictObject({
    id: directoryPathSchema,
    name: z.string().min(1),
    parent: directoryPathSchema.optional(),
  }) satisfies z.ZodType<ComponentDeclaration>;

  static readonly declarationsSchema = z.array(ComponentCatalog.declarationSchema)
    .min(1).superRefine((components, context) => new ComponentCatalog(components).validate(context));

  readonly #declarations: readonly Readonly<ComponentDeclaration>[];
  readonly #byId: ReadonlyMap<string, Readonly<ComponentDeclaration>>;

  constructor(declarations: readonly ComponentDeclaration[]) {
    // Keep candidate declarations so validation can report all errors together.
    this.#declarations = declarations.map(({ id, name, parent }) => ({ id, name, parent }));
    this.#byId = new Map(this.#declarations.map((component) => [component.id, component]));
  }

  has(id: string): boolean {
    return this.#byId.has(id);
  }

  ownerOf(file: string): string | undefined {
    if (isExternalFile(file)) return undefined;
    let owner: string | undefined;
    for (const component of this.#declarations) {
      const contains = component.id === "." || file.startsWith(`${component.id}/`);
      if (contains && (owner === undefined || owner === "." || component.id.length > owner.length)) owner = component.id;
    }
    return owner;
  }

  validate(context: z.RefinementCtx): void {
    const names = new Set<string>();
    const ids = new Set<string>();
    if (this.#declarations.filter(({ id }) => id === ".").length !== 1) {
      context.addIssue({ code: "custom", message: "Components must have exactly one root with ID '.'" });
    }
    this.#declarations.forEach((component, index) => {
      if (ids.has(component.id)) context.addIssue({ code: "custom", path: [index, "id"], message: "Component IDs must be unique" });
      if (names.has(component.name)) context.addIssue({ code: "custom", path: [index, "name"], message: "Component names must be unique" });
      ids.add(component.id);
      names.add(component.name);
      if (component.id === "." && component.parent !== undefined) {
        context.addIssue({ code: "custom", path: [index, "parent"], message: "The root component must not have a parent" });
      } else if (component.id !== "." && (component.parent === undefined || !this.#byId.has(component.parent))) {
        context.addIssue({ code: "custom", path: [index, "parent"], message: "Nonroot components must reference a declared parent" });
      }
    });
    this.validateParentCycles(context);
  }

  private validateParentCycles(context: z.RefinementCtx): void {
    const checked = new Set(["."]);
    this.#declarations.forEach((component, index) => {
      const chain = new Set<string>();
      let current: ComponentDeclaration | undefined = component;
      while (current && !checked.has(current.id)) {
        if (chain.has(current.id)) {
          context.addIssue({ code: "custom", path: [index, "parent"], message: "Component parents must form an acyclic tree rooted at '.'" });
          break;
        }
        chain.add(current.id);
        current = current.parent === undefined ? undefined : this.#byId.get(current.parent);
      }
      for (const id of chain) checked.add(id);
    });
  }
}
