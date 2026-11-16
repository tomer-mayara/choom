import { spawnSync } from "node:child_process";

// Temporary Git repositories for the tests of the Stage 1 Git identity. These
// commands do not read the developer's Git settings or GIT_* variables, so the
// settings cannot change a result.
const settings = { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_NAME: "Choom test",
  GIT_AUTHOR_EMAIL: "test@choom.invalid", GIT_COMMITTER_NAME: "Choom test", GIT_COMMITTER_EMAIL: "test@choom.invalid" };

function environment(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env))
    if (value !== undefined && !name.startsWith("GIT_")) values[name] = value;
  return { ...values, ...settings };
}

// Runs git in the folder and returns its standard output. A failure stops the test.
export function git(folder: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", folder, ...args], { encoding: "utf8", env: environment() });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

// Makes the folder a Git repository on branch main with one commit of all its
// files, and returns the commit ID.
export function commitAll(folder: string): string {
  git(folder, "init", "-q", "-b", "main");
  git(folder, "add", "-A");
  git(folder, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "First commit");
  return git(folder, "rev-parse", "HEAD").trim();
}
