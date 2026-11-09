import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { addKit, commit, git, makeRepo, runScript } from "./fixture-repo.mjs";

const index = (repo) => JSON.parse(readFileSync(join(repo, "index.json"), "utf8"));

/** Adds a second version of the sample kit, with its own version in kit.yaml. */
function addVersion(repo, version) {
  const folder = addKit(repo, "duckdb-sample", version);
  const kit = join(folder, "kit.yaml");
  const text = readFileSync(kit, "utf8").replace("version: 2026-11-10", `version: ${version}`);
  writeFileSync(kit, text.replace("replaces: null", "replaces: 2026-11-10"));
  const standard = join(folder, "standard.yaml");
  writeFileSync(
    standard,
    readFileSync(standard, "utf8").replace("version: 2026-11-10", `version: ${version}`),
  );
}

describe("index", () => {
  it("lists no kits for an empty repository", () => {
    const repo = makeRepo();
    const result = runScript("index.mjs", repo);
    assert.equal(result.status, 0, result.output);
    assert.deepEqual(index(repo), { kits: [] });
  });

  it("lists each kit with its versions, oldest first, and the commit of each tag", () => {
    const repo = makeRepo();
    addKit(repo, "duckdb-sample");
    commit(repo, "Add the first version");
    git(repo, "tag", "duckdb/sample@2026-11-10");
    const first = git(repo, "rev-parse", "HEAD");
    addVersion(repo, "2026-12-01");
    addKit(repo, "databricks-preview");
    commit(repo, "Add more");
    const result = runScript("index.mjs", repo);
    assert.equal(result.status, 0, result.output);
    assert.deepEqual(index(repo), {
      kits: [
        {
          id: "databricks/preview-demo",
          versions: [
            {
              version: "2026-11-10",
              title: "Preview demo on Databricks",
              summary: "A small synthetic kit that uses a feature still in preview.",
              packs: ["databricks@2"],
              features: "ga",
              maintainers: ["ingestron"],
              commit: null,
            },
          ],
        },
        {
          id: "duckdb/sample",
          versions: [
            {
              version: "2026-11-10",
              title: "Sample on DuckDB",
              summary: "A small synthetic kit that tests the repository checks.",
              packs: ["duckdb@2"],
              features: "ga",
              maintainers: ["ingestron"],
              commit: first,
            },
            {
              version: "2026-12-01",
              title: "Sample on DuckDB",
              summary: "A small synthetic kit that tests the repository checks.",
              packs: ["duckdb@2"],
              features: "ga",
              maintainers: ["ingestron"],
              commit: null,
            },
          ],
        },
      ],
    });
  });

  it("puts a preview before the release of the same date", () => {
    const repo = makeRepo();
    addKit(repo, "duckdb-sample");
    const folder = addKit(repo, "duckdb-sample", "2026-11-10-preview");
    const kit = join(folder, "kit.yaml");
    writeFileSync(
      kit,
      readFileSync(kit, "utf8")
        .replace("version: 2026-11-10", "version: 2026-11-10-preview")
        .replace("features: ga", "features: preview"),
    );
    const standard = join(folder, "standard.yaml");
    writeFileSync(
      standard,
      readFileSync(standard, "utf8").replace("version: 2026-11-10", "version: 2026-11-10-preview"),
    );
    runScript("index.mjs", repo);
    assert.deepEqual(
      index(repo).kits[0].versions.map((entry) => entry.version),
      ["2026-11-10-preview", "2026-11-10"],
    );
  });

  it("writes the same file twice", () => {
    const repo = makeRepo();
    addKit(repo, "duckdb-sample");
    runScript("index.mjs", repo);
    const once = readFileSync(join(repo, "index.json"), "utf8");
    runScript("index.mjs", repo);
    assert.equal(readFileSync(join(repo, "index.json"), "utf8"), once);
    assert.ok(once.endsWith("}\n"));
  });

  it("fails on a kit that breaks a rule, and writes nothing", () => {
    const repo = makeRepo();
    const folder = addKit(repo, "duckdb-sample");
    writeFileSync(join(folder, "kit.yaml"), "id: nope\n");
    const result = runScript("index.mjs", repo);
    assert.equal(result.status, 1);
    assert.match(result.output, /kits\/duckdb\/sample\/2026-11-10/);
  });
});
