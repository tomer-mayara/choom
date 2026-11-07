import { z } from "zod";
import { semanticMessages } from "./semantic-validation-messages.ts";

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

export function importRelationshipId(source: string, target: string): string {
  return `imports:${encodeURIComponent(source)}:${encodeURIComponent(target)}`;
}

export const filePathSchema = z.string().min(1).refine((value) => isCanonicalRepositoryPath(value), {
  message: semanticMessages.noncanonicalFilePath,
});

export const directoryPathSchema = z.string().min(1).refine((value) => isCanonicalRepositoryPath(value, true), {
  message: semanticMessages.noncanonicalDirectoryPath,
});
