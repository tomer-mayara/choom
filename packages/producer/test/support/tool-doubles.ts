import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The Stage 1 capture runs rsync and the Stage 2 tool image steps run Docker.
// These helpers put Python test doubles for both programs on a PATH, so the
// stage commands can run without either program. See doubles/*.py.
export interface DockerCall { args: string[]; stdin: string | null }

const doubles = fileURLToPath(new URL("./doubles/", import.meta.url));

// Returns a PATH that finds the rsync and Docker doubles before any real program.
export function pathWithDoubles(scratch: string): string {
  const bin = join(scratch, "doubles-bin");
  mkdirSync(bin);
  for (const name of ["rsync", "docker"])
    writeFileSync(join(bin, name), `#!/bin/sh\nexec python3 '${join(doubles, name + ".py")}' "$@"\n`, { mode: 0o755 });
  return `${bin}:${process.env.PATH ?? ""}`;
}

// Returns a PATH with only the programs that the stage commands need besides
// Docker, so that `command -v docker` fails.
export function pathWithoutDocker(scratch: string): string {
  const bin = join(scratch, "no-docker-bin");
  mkdirSync(bin);
  for (const name of ["node", "python3", "cat", "mkdir"]) {
    const program = Bun.which(name);
    if (program === null) throw new Error(`The tests need ${name} on PATH.`);
    symlinkSync(program, join(bin, name));
  }
  return bin;
}

export function dockerCalls(log: string): DockerCall[] {
  return readFileSync(log, "utf8").trimEnd().split("\n").map((line) => JSON.parse(line) as DockerCall);
}
