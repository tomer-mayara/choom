import type { z } from "zod";

const encoder = new TextEncoder();

/** The number of UTF-8 bytes of a text. */
export function utf8Length(text: string): number {
  return encoder.encode(text).byteLength;
}

/**
 * The text schema with a limit of UTF-8 bytes. A longer text gets the message
 * "The UTF-8 text limit is <bytes> bytes.", and the issue gets `params` when the
 * caller gives them, so that a reader can tell a limit from a wrong shape.
 */
export function utf8Bounded(schema: z.ZodString, bytes: number, params?: Record<string, unknown>) {
  const message = `The UTF-8 text limit is ${bytes} bytes.`;
  return schema.refine((value) => utf8Length(value) <= bytes, params ? { message, params } : message);
}
