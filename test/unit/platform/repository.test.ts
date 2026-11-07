import { expect, test } from "bun:test";
import { DesktopRepositoryAccess } from "../../../src/platform/repository";

test("browser repository access reports unavailable without invoking native commands", async () => {
  let calls = 0;
  const repository = new DesktopRepositoryAccess(async () => {
    calls += 1;
    throw new Error("No desktop transport");
  }, () => false);

  expect(await repository.openRepository({ rootPath: "/selected repo" })).toMatchObject({
    status: "failure",
    code: "unavailable",
  });
  expect(calls).toBe(0);
});

test("the adapter sends a validated request in the native command envelope", async () => {
  const requests: unknown[] = [];
  const repository = new DesktopRepositoryAccess(async (command, args) => {
    requests.push({ command, args });
    return { status: "success", value: { repositorySession: "repository-1" } };
  }, () => true);

  expect(await repository.openRepository({ rootPath: "/selected repo" })).toEqual({
    status: "success",
    value: { repositorySession: "repository-1" },
  });
  expect(requests).toEqual([{
    command: "repository_open",
    args: { request: { rootPath: "/selected repo" } },
  }]);
});

test("native transport rejection becomes a useful failure without leaking the native error", async () => {
  const repository = new DesktopRepositoryAccess(async () => {
    throw new Error("Cannot read /private/repo/secret");
  }, () => true);
  const result = await repository.readRepositoryText({ repositorySession: "repository-1", path: "component.yaml" });

  expect(result).toMatchObject({ status: "failure", code: "unavailable" });
  expect(JSON.stringify(result)).not.toContain("/private");
});

test("malformed session identifiers fail as data, without invoking the transport", async () => {
  let calls = 0;
  const repository = new DesktopRepositoryAccess(async () => { calls += 1; }, () => true);

  for (const repositorySession of ["", "repository-x", "repository-18446744073709551616", "repository-0"]) {
    expect(await repository.closeRepository({ repositorySession })).toMatchObject({ status: "failure", code: "invalid-request" });
  }
  expect(calls).toBe(0);
});

test("invalid paths, excess fields, and oversized requests stay outside the native boundary", async () => {
  let calls = 0;
  const repository = new DesktopRepositoryAccess(async () => { calls += 1; }, () => true);
  for (const request of [
    { rootPath: "relative/path" },
    { rootPath: "/valid", extra: true },
    { rootPath: `/中文${"a".repeat(4090)}` },
    { rootPath: "/hidden\nfile" },
  ]) {
    expect(await repository.openRepository(request)).toMatchObject({ status: "failure", code: "invalid-request" });
  }
  const repositorySession = "repository-1";
  expect(await repository.readRepositoryText({ repositorySession, path: "/outside" })).toMatchObject({ status: "failure", code: "invalid-request" });
  expect(await repository.resolveRepositoryPaths({ repositorySession, base: "src/../other", paths: ["x"] })).toMatchObject({ status: "failure", code: "invalid-request" });
  expect(await repository.resolveRepositoryPaths({ repositorySession, base: ".", paths: [] })).toMatchObject({ status: "failure", code: "invalid-request" });
  expect(await repository.resolveRepositoryPaths({ repositorySession, base: ".", paths: Array<string>(129).fill("src") })).toMatchObject({ status: "failure", code: "invalid-request" });
  expect(calls).toBe(0);
});

test("untrusted replies cannot expose unknown fields or noncanonical paths as successes", async () => {
  for (const reply of [
    null,
    { status: "success", value: { path: "../outside", text: "secret" } },
    { status: "success", value: { path: "src/./component.yaml", text: "data" } },
    { status: "success", value: { path: "component.yaml", text: "中文".repeat(44_000) } },
    { status: "success", value: { path: "component.yaml", text: "data", extra: true } },
    { status: "failure", code: "unexpected", message: "Unknown failure" },
  ]) {
    const repository = new DesktopRepositoryAccess(async () => reply, () => true);
    expect(await repository.readRepositoryText({ repositorySession: "repository-1", path: "component.yaml" }))
      .toMatchObject({ status: "failure", code: "invalid-response" });
  }
});

test("path results must match the batch cardinality", async () => {
  const repository = new DesktopRepositoryAccess(async () => ({
    status: "success", value: { paths: [{ location: "inside", path: "src", kind: "directory" }] },
  }), () => true);

  expect(await repository.resolveRepositoryPaths({ repositorySession: "repository-1", base: ".", paths: ["src", "config.cjs"] }))
    .toMatchObject({ status: "failure", code: "invalid-response" });
});

test("native domain failures and all successful operation values remain intact", async () => {
  const reply = { status: "failure", code: "source-changed", message: "The selected source changed." } as const;
  const repository = new DesktopRepositoryAccess(async () => reply, () => true);
  expect(await repository.readRepositoryText({ repositorySession: "repository-1", path: "component.yaml" })).toEqual(reply);

  const operations = new DesktopRepositoryAccess(async (command) => {
    switch (command) {
      case "repository_read_text": return { status: "success", value: { path: "src/component.yaml", text: "name: 中文" } };
      case "repository_resolve_paths": return { status: "success", value: { paths: [
        { location: "inside", path: "src", kind: "directory" },
        { location: "outside", reference: "outside-1" },
      ] } };
      case "repository_close": return { status: "success", value: { closed: true } };
      default: throw new Error("Unexpected operation");
    }
  }, () => true);
  const repositorySession = "repository-1";
  expect(await operations.readRepositoryText({ repositorySession, path: "./src/component.yaml" })).toEqual({ status: "success", value: { path: "src/component.yaml", text: "name: 中文" } });
  expect(await operations.resolveRepositoryPaths({ repositorySession, base: "src", paths: [".", "../../outside"] })).toEqual({ status: "success", value: { paths: [
    { location: "inside", path: "src", kind: "directory" },
    { location: "outside", reference: "outside-1" },
  ] } });
  expect(await operations.closeRepository({ repositorySession })).toEqual({ status: "success", value: { closed: true } });
});
