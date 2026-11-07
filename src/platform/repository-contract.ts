import { z } from "zod";

const MAX_PATH_BYTES = 4096;
const MAX_TEXT_BYTES = 262_144;
const encoder = new TextEncoder();
const boundedPath = z.string().min(1).refine(
  (value) => encoder.encode(value).byteLength <= MAX_PATH_BYTES && !/[\x00-\x1f\x7f]/u.test(value),
  "Expected a bounded path without control characters",
);
const session = z.string().refine(
  (value) => /^repository-[1-9][0-9]{0,19}$/u.test(value)
    && BigInt(value.slice("repository-".length)) <= 18_446_744_073_709_551_615n,
  "Repository session identifier is out of range",
);
const isAbsolute = (path: string) => /^(?:\/|[a-z]:[\\/]|\\\\)/iu.test(path);
const relativePath = boundedPath.refine(
  (value) => !value.startsWith("/") && !value.includes("\\") && !/^[a-z]:/iu.test(value),
  "Expected a repository-relative path",
);
const canonicalPath = relativePath.refine(
  (value) => value === "." || value.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
  "Expected a canonical repository-relative path",
);
const failure = z.strictObject({
  status: z.literal("failure"),
  code: z.enum([
    "invalid-request", "invalid-session", "not-found", "not-directory", "not-file",
    "outside-root", "limit-exceeded", "invalid-utf8", "access-denied", "io-error",
    "source-changed", "unavailable", "invalid-response",
  ]),
  message: z.string().min(1),
});

const resolvedPath = z.discriminatedUnion("location", [
  z.strictObject({ location: z.literal("inside"), path: canonicalPath, kind: z.enum(["file", "directory"]) }),
  z.strictObject({ location: z.literal("outside"), reference: z.string().regex(/^outside-[1-9][0-9]{0,3}$/u) }),
]);

export const repositoryContracts = {
  openRepository: {
    request: z.strictObject({ rootPath: boundedPath.refine(isAbsolute, "Expected an absolute directory path") }),
    outcome: z.union([
      z.strictObject({ status: z.literal("success"), value: z.strictObject({ repositorySession: session }) }),
      failure,
    ]),
  },
  readRepositoryText: {
    request: z.strictObject({ repositorySession: session, path: relativePath }),
    outcome: z.union([
      z.strictObject({ status: z.literal("success"), value: z.strictObject({
        path: canonicalPath,
        text: z.string().refine((value) => encoder.encode(value).byteLength <= MAX_TEXT_BYTES, "Repository text exceeds its byte limit"),
      }) }),
      failure,
    ]),
  },
  resolveRepositoryPaths: {
    request: z.strictObject({ repositorySession: session, base: canonicalPath, paths: z.array(boundedPath).min(1).max(128) }),
    outcome: z.union([
      z.strictObject({ status: z.literal("success"), value: z.strictObject({ paths: z.array(resolvedPath).min(1).max(128) }) }),
      failure,
    ]),
  },
  closeRepository: {
    request: z.strictObject({ repositorySession: session }),
    outcome: z.union([
      z.strictObject({ status: z.literal("success"), value: z.strictObject({ closed: z.literal(true) }) }),
      failure,
    ]),
  },
};
