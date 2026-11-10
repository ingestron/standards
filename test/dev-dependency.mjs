// The packages the tests use that package.json names as devDependencies (`ajv`, `yaml`).
import { existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The folder of a package, looked up from `start` the way Node looks for `node_modules`. */
function packageFolder(name, start) {
  for (let folder = realpathSync(start); ; folder = dirname(folder)) {
    const found = join(folder, "node_modules", name);
    if (existsSync(join(found, "package.json"))) return found;
    if (dirname(folder) === folder)
      throw new Error(`${name} is not installed; run npm ci.`);
  }
}

/**
 * A devDependency, imported by name. Until `npm install` has put it in node_modules, as in a
 * checkout that links the CLI and core from a local build, the same version comes from
 * @ingestron/config, which @ingestron/core depends on.
 */
export async function devDependency(name) {
  try {
    return await import(name);
  } catch {
    const config = packageFolder(
      "@ingestron/config",
      packageFolder("@ingestron/core", repo),
    );
    return createRequire(join(config, "package.json"))(name);
  }
}
