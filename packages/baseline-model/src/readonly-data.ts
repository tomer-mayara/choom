/** A read-only projection for data shared with observers, without changing its wire shape. */
export type ReadonlyData<Value> = Value extends readonly (infer Item)[]
  ? ReadonlyArray<ReadonlyData<Item>>
  : Value extends object ? { readonly [Key in keyof Value]: ReadonlyData<Value[Key]> } : Value;
