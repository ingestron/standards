// Every kit in this repository, built with the CLI: the Databricks bundle a kit builds is
// valid for the Databricks CLI the pack names. The bundle schema is not stored here: the
// test asks the installed Databricks CLI for it (`databricks bundle schema`), trims it with
// scripts/trim-bundle-schema.mjs, and skips when that CLI is missing or older than v1.23.0.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { cliPath } from "../scripts/check-kits.mjs";
import { allKitFolders, kitIn, shown, tagOf } from "../scripts/kits.mjs";
import { devDependency } from "./dev-dependency.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");

const ajv = await devDependency("ajv");
const Ajv = ajv.Ajv ?? ajv.default?.Ajv ?? ajv.default;
const { parse } = await devDependency("yaml");

/** The oldest Databricks CLI whose bundle schema the kits are checked against. */
const minimum = [1, 23, 0];

/** Why the bundle cannot be checked here, or undefined when the Databricks CLI is fit. */
function databricksMissing() {
  const run = spawnSync("databricks", ["--version"], { encoding: "utf8" });
  if (run.error || run.status !== 0)
    return "the Databricks CLI is not installed; install v1.23.0 or later to check the bundles";
  const found = /v(\d+)\.(\d+)\.(\d+)/.exec(run.stdout);
  if (!found)
    return `cannot read the Databricks CLI's version from: ${run.stdout.trim()}`;
  const version = found.slice(1).map(Number);
  const older = version.findIndex((part, at) => part !== minimum[at]);
  if (older >= 0 && version[older] < minimum[older])
    return `the Databricks CLI is v${version.join(".")}; the bundles need v1.23.0 or later`;
  return undefined;
}

/** The bundle schema of the installed Databricks CLI, trimmed, written to a temporary file and read back. */
function bundleSchema() {
  const printed = spawnSync("databricks", ["bundle", "schema"], {
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
  assert.equal(printed.status, 0, printed.stderr);
  const trim = join(repo, "scripts", "trim-bundle-schema.mjs");
  const trimmed = spawnSync(process.execPath, [trim], {
    input: printed.stdout,
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
  assert.equal(trimmed.status, 0, trimmed.stderr);
  const folder = mkdtempSync(join(tmpdir(), "bundle-schema-"));
  try {
    const file = join(folder, "databricks-bundle.schema.json");
    writeFileSync(file, trimmed.stdout);
    return JSON.parse(readFileSync(file, "utf8"));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/** The files `ingestron apply` writes for a copy of the kit, by path under `build`. */
function applied(folder) {
  const copy = mkdtempSync(join(tmpdir(), "kit-apply-"));
  try {
    cpSync(folder, copy, { recursive: true });
    const args = [
      cliPath(),
      "apply",
      "--definitions",
      copy,
      "--out",
      join(copy, "build"),
    ];
    const run = spawnSync(process.execPath, args, {
      cwd: copy,
      encoding: "utf8",
    });
    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
    return readTree(join(copy, "build"));
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

function readTree(root, prefix = "") {
  if (!existsSync(join(root, prefix))) return {};
  return Object.fromEntries(
    readdirSync(join(root, prefix), { withFileTypes: true }).flatMap(
      (entry) => {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) return Object.entries(readTree(root, path));
        return [[path, readFileSync(join(root, path), "utf8")]];
      },
    ),
  );
}

const databricksKits = allKitFolders(repo)
  .folders.map((folder) => ({ folder, kit: kitIn(repo, folder) }))
  .filter(({ kit }) =>
    kit.packs.some((pack) => pack.startsWith("databricks@")),
  );

const missing = databricksMissing();

describe("the bundle a Databricks kit builds", { skip: missing }, () => {
  const validate = missing
    ? undefined
    : new Ajv({ strict: false, allErrors: true }).compile(bundleSchema());

  it("is built for at least one kit", () => {
    assert.ok(databricksKits.length > 0);
  });

  for (const { folder, kit } of databricksKits) {
    it(`is valid for the Databricks CLI: ${tagOf(kit)} (${shown(repo, folder)})`, () => {
      const files = applied(folder);
      const bundle = Object.keys(files).filter(
        (path) =>
          path === "databricks/databricks.yml" ||
          /^databricks\/resources\/[^/]+\.yml$/.test(path),
      );
      assert.ok(
        bundle.includes("databricks/databricks.yml"),
        Object.keys(files).join("\n"),
      );
      assert.ok(bundle.length > 1, "the bundle has resource files");
      for (const path of bundle) {
        const valid = validate(parse(files[path]));
        assert.ok(
          valid,
          `${path}: ${JSON.stringify(validate.errors, null, 2)}`,
        );
      }
    });
  }
});
