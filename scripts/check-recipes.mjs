// Checks source recipes. For each file in `recipes/` (all of them when none is named):
//   1. readSourceRecipe accepts it: the id is the file's name, `ask` is complete, every
//      `match` is a regular expression, and there is at least one source with a real date;
//   2. no `read` date of its sources is later than today.
// A file in `recipes/` that is not `<id>.yaml` is a problem too.
// Usage, from the repository's root folder: node scripts/check-recipes.mjs [<recipe file>...]
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { readSourceRecipe } from "@ingestron/core";

/** The folder that holds the recipes. */
export function recipesRoot(repo) {
  return join(repo, "recipes");
}

/** A path as shown to people: relative to the repository, with `/` between its parts. */
function shown(repo, path) {
  return relative(repo, path).split(sep).join("/");
}

/** The files of `recipes`, sorted, as paths; none when the folder is not there. */
export function allRecipeFiles(repo) {
  const root = recipesRoot(repo);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => !name.startsWith("."))
    .sort()
    .map((name) => join(root, name));
}

/** Today as `YYYY-MM-DD`: the later of the date here and the date in UTC, so no one is out by a time zone. */
export function today(now = new Date()) {
  const local = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
  const utc = now.toISOString().slice(0, 10);
  return local > utc ? local : utc;
}

/** Every problem with one recipe file; `name` is how it is shown. */
export function recipeProblems(repo, file, date = today()) {
  const name = shown(repo, file);
  if (!file.endsWith(".yaml"))
    return { name, problems: ["A recipe is recipes/<id>.yaml; this file is not one."] };
  let recipe;
  try {
    recipe = readSourceRecipe(readFileSync(file, "utf8"), name);
  } catch (error) {
    return { name, problems: [error.message] };
  }
  const problems = recipe.sources
    .filter((source) => source.read > date)
    .map((source) => `${source.url} was read on ${source.read}, which is after today (${date}).`);
  return { name, problems };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repo = process.cwd();
  const named = process.argv.slice(2);
  const files = named.length === 0 ? allRecipeFiles(repo) : named.map((path) => resolve(repo, path));
  let failed = 0;
  for (const file of files) {
    const { name, problems } = recipeProblems(repo, file);
    console.log(`${problems.length === 0 ? "ok  " : "FAIL"}  ${name}`);
    for (const problem of problems) console.log(`      - ${problem}`);
    if (problems.length > 0) failed += 1;
  }
  if (failed > 0) console.log(`${failed} of ${files.length} recipes have problems.`);
  process.exitCode = failed > 0 ? 1 : 0;
}
