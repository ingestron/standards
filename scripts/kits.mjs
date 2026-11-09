// What both scripts share: finding the kit folders of a repository, reading
// them, and asking git about their tags. A repository holds its kits in
// `kits/<platform>/<name>/<version>/`; the scripts run in its root folder.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { readKit } from "@ingestron/core";

/** The folder that holds the kits. */
export function kitsRoot(repo) {
  return join(repo, "kits");
}

/** A path as shown to people: relative to the repository, with `/` between its parts. */
export function shown(repo, path) {
  return relative(repo, path).split(sep).join("/");
}

/** The sub-folders of `folder`, sorted, leaving out names that start with a dot. */
function folders(folder) {
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => join(folder, entry.name))
    .sort();
}

/**
 * Every version folder under `kits`, and the problems found on the way: a
 * `kit.yaml` anywhere but at `<platform>/<name>/<version>` is a problem.
 */
export function allKitFolders(repo) {
  const root = kitsRoot(repo);
  const found = { folders: [], problems: [] };
  if (!existsSync(root)) return found;
  for (const platform of folders(root)) {
    for (const name of folders(platform)) {
      for (const version of folders(name)) found.folders.push(version);
    }
  }
  for (const level of [root, ...folders(root), ...folders(root).flatMap(folders)]) {
    if (existsSync(join(level, "kit.yaml")))
      found.problems.push(
        `${shown(repo, level)}: a kit folder is kits/<platform>/<name>/<version>, with its kit.yaml.`,
      );
  }
  return found;
}

/** The folders a command line names, or every kit folder when it names none. */
export function chosenFolders(repo, names) {
  if (names.length === 0) return allKitFolders(repo);
  return { folders: names.map((name) => resolve(repo, name)), problems: [] };
}

/** The kit in `folder`, read under the repository's `kits` folder; throws a plain `Error` when a rule is broken. */
export function kitIn(repo, folder) {
  return readKit(folder, kitsRoot(repo));
}

/** The git tag of a kit version: `<id>@<version>`. */
export function tagOf(kit) {
  return `${kit.id}@${kit.version}`;
}

function git(repo, args) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** The commit a tag points to, or null when the tag does not exist. */
export function tagCommit(repo, tag) {
  try {
    return git(repo, ["rev-parse", "-q", "--verify", `refs/tags/${tag}^{commit}`]).trim();
  } catch {
    return null;
  }
}

/** The files of `folder` that differ from the tag, or are new, relative to the repository. */
export function changedSince(repo, tag, folder) {
  const path = shown(repo, folder);
  const changed = git(repo, ["diff", "--name-only", `refs/tags/${tag}`, "--", path]);
  const added = git(repo, ["ls-files", "--others", "--exclude-standard", "--", path]);
  return `${changed}${added}`.split("\n").filter((line) => line !== "");
}

/** Orders versions by date; on the same date the preview comes first. */
export function byVersion(a, b) {
  const key = (version) => `${version.slice(0, 10)} ${version.endsWith("-preview") ? 0 : 1}`;
  return key(a).localeCompare(key(b));
}
