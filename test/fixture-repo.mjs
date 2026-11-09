// Helpers for the tests: a small git repository made in a temporary folder,
// kits copied into it from test/fixtures, and the scripts run against it.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const scripts = join(here, "..", "scripts");

/** Runs git in `repo` and returns its output; fails the test when git fails. */
export function git(repo, ...args) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

/** A new repository with an empty `kits` folder and one commit. */
export function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), "standards-test-"));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "commit.gpgsign", "false");
  git(repo, "config", "tag.gpgsign", "false");
  mkdirSync(join(repo, "kits"));
  commit(repo, "Start");
  return repo;
}

/** Commits everything, allowing an empty commit. */
export function commit(repo, message) {
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "--allow-empty", "-m", message);
}

/**
 * Copies a fixture kit to `kits/<id>/<version>` and returns that folder, where
 * `id` and `version` are the ones in its kit.yaml unless `version` is given.
 */
export function addKit(repo, fixture, version) {
  const source = join(here, "fixtures", fixture);
  const text = readFileSync(join(source, "kit.yaml"), "utf8");
  const id = /^id: (.+)$/m.exec(text)[1];
  const own = /^version: (.+)$/m.exec(text)[1];
  const folder = join(repo, "kits", id, version ?? own);
  cpSync(source, folder, { recursive: true });
  return folder;
}

/** Runs one of the scripts with `repo` as the working folder. */
export function runScript(name, repo, args = [], env = {}) {
  const result = spawnSync("node", [join(scripts, name), ...args], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}
