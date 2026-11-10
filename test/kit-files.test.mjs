// Rules for the files of every kit in this repository, beyond the format that
// `npm run check` checks.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { allKitFolders, kitIn, tagOf } from "../scripts/kits.mjs";
import { devDependency } from "./dev-dependency.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const { parse } = await devDependency("yaml");

const kits = allKitFolders(repo).folders.map((folder) => ({
  folder,
  kit: kitIn(repo, folder),
}));

/** The paths of a kit's files, below its folder. */
function files(folder, prefix = "") {
  return readdirSync(join(folder, prefix), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      return entry.isDirectory() ? files(folder, path) : [path];
    },
  );
}

/** The key names of the values that are `REPLACE_ME`, outside `environments`. */
function blanks(node, key = "", found = []) {
  if (node === "REPLACE_ME") found.push(key);
  else if (Array.isArray(node)) for (const item of node) blanks(item, key, found);
  else if (node && typeof node === "object")
    for (const [name, child] of Object.entries(node))
      if (name !== "environments") blanks(child, name, found);
  return found;
}

describe("every kit's files", () => {
  it("finds the kits", () => {
    assert.ok(kits.length > 0);
  });

  for (const { folder, kit } of kits) {
    describe(tagOf(kit), () => {
      it("platform.yaml starts by naming the kit it came from", () => {
        const text = readFileSync(join(folder, "platform.yaml"), "utf8");
        assert.equal(text.split("\n")[0], `# From ${tagOf(kit)}`);
      });

      it("gives each REPLACE_ME a name of its own, so init --set sets one value", () => {
        const names = ["project.yaml", "platform.yaml"].flatMap((file) =>
          blanks(parse(readFileSync(join(folder, file), "utf8"))),
        );
        const twice = names.filter((name, at) => names.indexOf(name) !== at);
        assert.deepEqual(twice, [], `REPLACE_ME more than once as: ${twice.join(", ")}`);
      });

      it("orders each ROW_NUMBER() window by more than one column, so ties pick the same row", () => {
        for (const path of files(folder).filter((item) => item.endsWith(".sql"))) {
          const sql = readFileSync(join(folder, path), "utf8");
          for (const [, window] of sql.matchAll(
            /ROW_NUMBER\(\)\s+OVER\s*\(([^)]*)\)/gi,
          )) {
            const order = /ORDER\s+BY\s+([\s\S]*)$/i.exec(window)?.[1] ?? "";
            assert.ok(order.includes(","), `${path}: ORDER BY ${order.trim()}`);
          }
        }
      });
    });
  }
});
