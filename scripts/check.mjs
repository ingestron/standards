// Runs the checks of both kinds of content: kits (scripts/check-kits.mjs) and recipes
// (scripts/check-recipes.mjs). With no argument, it checks all of each. A named path that
// starts `recipes/` goes to the recipe check and any other to the kit check, and a check
// with no path named runs only when no path is named at all.
// Usage, from the repository's root folder: node scripts/check.mjs [<kit folder or recipe file>...]
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const named = process.argv.slice(2);
const isRecipe = (path) => /^(\.\/)?recipes\//.test(path);
const runs =
  named.length === 0
    ? [
        ["check-kits.mjs", []],
        ["check-recipes.mjs", []],
      ]
    : [
        ["check-kits.mjs", named.filter((path) => !isRecipe(path))],
        ["check-recipes.mjs", named.filter(isRecipe)],
      ].filter(([, paths]) => paths.length > 0);

let status = 0;
for (const [script, paths] of runs) {
  const run = spawnSync("node", [join(here, script), ...paths], { stdio: "inherit" });
  if (run.status !== 0) status = 1;
}
process.exitCode = status;
