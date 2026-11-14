/** Reading choices belong to an inspection frame and disappear with that view. */
export interface InterfaceReadingState {
  tab: string;
  positions: Record<string, number>;
  entryId?: string;
  exampleId?: string;
  resultOpen: boolean;
  opened: ReadonlySet<string>;
}

export function interfaceReadingState(entryId?: string): InterfaceReadingState {
  return { tab: "overview", positions: {}, entryId, resultOpen: false, opened: new Set() };
}
