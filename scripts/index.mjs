// Writes index.json: each kit, its versions and the commit of each version's
// tag. Run it from the repository's root folder after the kits are checked.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { allKitFolders, byVersion, kitIn, shown, tagCommit, tagOf } from "./kits.mjs";

/** The index of the repository's kits; throws when a kit folder breaks a rule. */
export function buildIndex(repo) {
  const { folders, problems } = allKitFolders(repo);
  const byId = new Map();
  for (const folder of folders) {
    let kit;
    try {
      kit = kitIn(repo, folder);
    } catch (error) {
      problems.push(`${shown(repo, folder)}: ${error.message}`);
      continue;
    }
    const { id, version, title, summary, packs, features, maintainers } = kit;
    const commit = tagCommit(repo, tagOf(kit));
    const versions = byId.get(id) ?? [];
    versions.push({ version, title, summary, packs, features, maintainers, commit });
    byId.set(id, versions);
  }
  if (problems.length > 0) throw new Error(problems.join("\n"));
  const kits = [...byId.keys()].sort().map((id) => ({
    id,
    versions: byId.get(id).sort((a, b) => byVersion(a.version, b.version)),
  }));
  return { kits };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repo = process.cwd();
  try {
    writeFileSync(join(repo, "index.json"), `${JSON.stringify(buildIndex(repo), null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
