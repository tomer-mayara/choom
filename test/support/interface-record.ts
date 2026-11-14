/** Inspect the whole displayed record without weakening checks to text fragments. */
export function parseInterfaceRecord(text: string): Record<string, unknown> {
  const record: unknown = JSON.parse(text);
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Original record must display the saved object.");
  return Object.fromEntries(Object.entries(record));
}
