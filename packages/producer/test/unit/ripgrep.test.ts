import { describe, expect, test } from "bun:test";
import { accessSync, constants, lstatSync } from "node:fs";
import { rgPath } from "@vscode/ripgrep";
import { ripgrepEnvironment, ripgrepVersion } from "../../src/ripgrep.ts";

// The ripgrep program that @vscode/ripgrep installs from its package for this
// platform. The install runs no script, so `bun install` alone puts it in place.
describe("the installed ripgrep program", () => {
  test("exists after bun install and reports its version", () => {
    expect(lstatSync(rgPath).isFile()).toBe(true);
    expect(() => accessSync(rgPath, constants.X_OK)).not.toThrow();
    expect(ripgrepVersion(rgPath)).toBe("ripgrep 15.0.0 (rev 3a612f88b8)");
  });

  test("a program that is not ripgrep gives no version", () => {
    expect(() => ripgrepVersion(process.execPath)).toThrow(`${process.execPath} --version does not report a ripgrep version.`);
  });
});

describe("the environment of a ripgrep call", () => {
  test("keeps the caller's variables but not the ripgrep configuration file", () => {
    expect(ripgrepEnvironment({ HOME: "/home/operator", RIPGREP_CONFIG_PATH: "/home/operator/.ripgreprc", PATH: "/bin" }))
      .toEqual({ HOME: "/home/operator", PATH: "/bin" });
  });
});
