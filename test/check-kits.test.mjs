import assert from "node:assert/strict";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { addKit, commit, git, makeRepo, runScript } from "./fixture-repo.mjs";

const check = (repo, args) => runScript("check-kits.mjs", repo, args);

describe("check-kits", () => {
  it("passes a kit that builds and says why it is shaped so", () => {
    const repo = makeRepo();
    addKit(repo, "duckdb-sample");
    const result = check(repo);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /duckdb\/sample@2026-11-10/);
  });

  it("checks only the folders named", () => {
    const repo = makeRepo();
    addKit(repo, "duckdb-sample");
    const broken = addKit(repo, "duckdb-sample", "2026-11-11");
    writeFileSync(join(broken, "kit.yaml"), "id: nope\n");
    const result = check(repo, ["kits/duckdb/sample/2026-11-10"]);
    assert.equal(result.status, 0, result.output);
  });

  it("fails a kit that breaks a rule of kit.yaml, naming the folder", () => {
    const repo = makeRepo();
    const folder = addKit(repo, "duckdb-sample");
    appendFileSync(join(folder, "kit.yaml"), "colour: blue\n");
    const result = check(repo);
    assert.equal(result.status, 1);
    assert.match(result.output, /kits\/duckdb\/sample\/2026-11-10/);
    assert.match(result.output, /colour/);
  });

  it("fails a kit whose plan reports an error", () => {
    const repo = makeRepo();
    const folder = addKit(repo, "duckdb-sample");
    writeFileSync(
      join(folder, "flows", "orders.yaml"),
      readFileSync(join(folder, "flows", "orders.yaml"), "utf8").replace(
        "source: shop",
        "source: nope",
      ),
    );
    const result = check(repo);
    assert.equal(result.status, 1);
    assert.match(result.output, /BROKEN_LINK/);
  });

  it("fails a ga kit whose plan reports PREVIEW_FEATURE", () => {
    const repo = makeRepo();
    addKit(repo, "databricks-preview");
    const result = check(repo);
    assert.equal(result.status, 1);
    assert.match(result.output, /PREVIEW_FEATURE/);
    assert.match(result.output, /databricks\/preview-demo@2026-11-10/);
    assert.doesNotMatch(result.output, /error/);
  });

  it("passes a ga Databricks kit that uses only features that are generally available", () => {
    const repo = makeRepo();
    const folder = addKit(repo, "databricks-preview");
    const standard = join(folder, "standard.yaml");
    writeFileSync(
      standard,
      readFileSync(standard, "utf8").replace("[failure, slow], slow_after: 1h", "[failure]"),
    );
    const result = check(repo);
    assert.equal(result.status, 0, result.output);
  });

  it("passes a preview kit that uses a preview feature", () => {
    const repo = makeRepo();
    const folder = addKit(repo, "databricks-preview", "2026-11-10-preview");
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
      readFileSync(standard, "utf8")
        .replace("features: ga", "features: preview")
        .replace("version: 2026-11-10", "version: 2026-11-10-preview"),
    );
    const result = check(repo);
    assert.equal(result.status, 0, result.output);
  });

  it("fails a README that leaves out a section the standard writes", () => {
    const repo = makeRepo();
    const folder = addKit(repo, "databricks-preview");
    const standard = join(folder, "standard.yaml");
    writeFileSync(
      standard,
      readFileSync(standard, "utf8")
        .replace("features: ga", "features: preview")
        .replace(
          /operations:[\s\S]*/,
          "operations: { timeout: 1h }\nretention: { time_travel: 7d }\n",
        ),
    );
    const result = check(repo);
    assert.equal(result.status, 1);
    assert.match(result.output, /README/);
    assert.match(result.output, /retention/);
    assert.doesNotMatch(result.output, /backticks:[^\n]*operations/);
  });

  it("reads the sections a layer writes from the standard", () => {
    const repo = makeRepo();
    const folder = addKit(repo, "duckdb-sample");
    writeFileSync(join(folder, "README.md"), "# Sample\n\nNothing about the layers.\n");
    const result = check(repo);
    assert.equal(result.status, 1);
    assert.match(result.output, /does not name in backticks: history/);
  });

  it("fails a README that uses a section's name only as a plain word", () => {
    const repo = makeRepo();
    const folder = addKit(repo, "duckdb-sample");
    writeFileSync(join(folder, "README.md"), "# Sample\n\nBronze keeps its history as it loads.\n");
    const result = check(repo);
    assert.equal(result.status, 1);
    assert.match(result.output, /does not name in backticks: history/);
  });

  it("fails a tagged folder that has changed since its tag, naming it", () => {
    const repo = makeRepo();
    const folder = addKit(repo, "duckdb-sample");
    commit(repo, "Add the kit");
    git(repo, "tag", "duckdb/sample@2026-11-10");
    assert.equal(check(repo).status, 0);
    appendFileSync(join(folder, "README.md"), "\nMore words.\n");
    const result = check(repo);
    assert.equal(result.status, 1);
    assert.match(result.output, /duckdb\/sample@2026-11-10/);
    assert.match(result.output, /README\.md/);
    assert.match(result.output, /changed since/);
  });

  it("fails a tagged folder that gained a file, even before it is committed", () => {
    const repo = makeRepo();
    const folder = addKit(repo, "duckdb-sample");
    commit(repo, "Add the kit");
    git(repo, "tag", "duckdb/sample@2026-11-10");
    writeFileSync(join(folder, "extra.txt"), "new\n");
    const result = check(repo);
    assert.equal(result.status, 1);
    assert.match(result.output, /extra\.txt/);
  });

  it("leaves a folder with no tag free to change", () => {
    const repo = makeRepo();
    const folder = addKit(repo, "duckdb-sample");
    commit(repo, "Add the kit");
    appendFileSync(join(folder, "README.md"), "\nMore words.\n");
    assert.equal(check(repo).status, 0);
  });

  it("uses the CLI that INGESTRON_CLI names", () => {
    const repo = makeRepo();
    addKit(repo, "duckdb-sample");
    const result = runScript("check-kits.mjs", repo, [], {
      INGESTRON_CLI: join(repo, "missing.js"),
    });
    assert.equal(result.status, 1);
    assert.match(result.output, /INGESTRON_CLI|missing\.js/);
  });
});
