// The lists of baseline items. The rule reads only the ID of each item.
interface ItemLists {
  readonly components: readonly { readonly id: string }[];
  readonly interfaces: readonly { readonly id: string }[];
  readonly resources: readonly { readonly id: string }[];
  readonly rules: readonly { readonly id: string }[];
}

/**
 * The components, interfaces, resources and rules of a baseline that a subject
 * reference of a discovery question or gap can name. A reference names an item
 * when it equals the item ID or starts with the ID and a dot, such as
 * billing.purpose. An item ID has no dot, so the ID is the text before the first
 * dot. The viewer places each question and gap on the items that it names, and
 * the producer record checks use the same rule.
 */
export class SubjectItems {
  private readonly ids: ReadonlySet<string>;

  constructor(baseline: ItemLists) {
    this.ids = new Set([...baseline.components, ...baseline.interfaces, ...baseline.resources, ...baseline.rules]
      .map(({ id }) => id));
  }

  /** The ID of the item that the reference names, or undefined when it names no item. */
  namedItem(reference: string): string | undefined {
    const dot = reference.indexOf(".");
    const id = dot < 0 ? reference : reference.slice(0, dot);
    return this.ids.has(id) ? id : undefined;
  }
}
