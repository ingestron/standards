// The source recipes in recipes/: each is read by core's readSourceRecipe, and each is tried on a
// synthetic result file, written exactly as the recipe's query or call returns it (test/recipes/
// <id>/result.csv, .xml or .json). A recipe whose call is made once for each object, as Salesforce's
// is, has one file for each object in test/recipes/<id>/results/<object>.json. The test imports
// them with core's public importSource, as the CLI would, and compares the tables of the document
// it writes with test/recipes/<id>/expected.json. The result files hold only invented names and
// values, so the test needs no source and no network. The recipe check script is tested here too.
import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { importSource, readSourceRecipe } from "@ingestron/core";
import { allRecipeFiles, recipeProblems, today } from "../scripts/check-recipes.mjs";
import { runScript } from "./fixture-repo.mjs";
import { devDependency } from "./dev-dependency.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const { parse } = await devDependency("yaml");

/** The eight fields of the columns file, in the order a query returns them. */
const COLUMNS_FIELDS = [
  "table_catalog",
  "table_schema",
  "table_name",
  "column_name",
  "ordinal_position",
  "data_type",
  "is_nullable",
  "primary_key_position",
];

const DATABASES = ["sqlserver", "oracle", "mysql", "postgresql"];
const APPLICATIONS = ["salesforce", "dataverse", "sap-odata"];
const IMPORTED_AT = "2026-11-12T09:30:00Z";

/** The connection each recipe is tried with: the databases use `erp`. */
const CONNECTIONS = { sample: "landing", salesforce: "crm", dataverse: "crm", "sap-odata": "erp" };

/** A custom object or table, and a custom field, that each application's result holds. */
const CUSTOM = {
  salesforce: { object: "Invoice_Line__c", column: "Amount__c" },
  dataverse: { object: "new_project", column: "new_budget" },
  "sap-odata": { object: "OrderItems", column: "ZZ_CustomRemark" },
};

const recipeFile = (id) => join(repo, "recipes", `${id}.yaml`);
const caseFile = (id, name) => join(repo, "test", "recipes", id, name);
const recipeOf = (id) => readSourceRecipe(readFileSync(recipeFile(id), "utf8"), `recipes/${id}.yaml`);

/** The result files of a recipe: one for each object, or the one `result.<ext>`. */
function resultFiles(id) {
  const folder = caseFile(id, "results");
  if (existsSync(folder))
    return readdirSync(folder)
      .sort()
      .map((name) => ({ path: join(folder, name), object: name.slice(0, name.lastIndexOf(".")) }));
  const name = readdirSync(caseFile(id, "")).find((file) => file.startsWith("result."));
  return [{ path: caseFile(id, name), object: id === "sample" ? "orders" : "" }];
}

/**
 * Imports the recipe's result files at the paths the recipe says to save them, one after the other,
 * each into the document the one before made, as the CLI would.
 */
function importResult(id) {
  const recipe = recipeOf(id);
  const connection = CONNECTIONS[id] ?? "erp";
  let text;
  const notes = [];
  const files = [];
  for (const { path, object } of resultFiles(id)) {
    const file = recipe.ask.save.replace("{connection}", connection).replace("{object}", object);
    const contents = readFileSync(path, "utf8");
    const result = importSource({
      connection,
      current: text,
      file,
      contents,
      recipe,
      at: IMPORTED_AT,
    });
    assert.ok("text" in result, `the import was refused: ${JSON.stringify(result)}`);
    text = result.text;
    notes.push(...result.notes);
    files.push({ file, object, contents });
  }
  return { recipe, connection, files, notes, text, document: parse(text) };
}

describe("the recipes", () => {
  const ids = readdirSync(join(repo, "recipes"))
    .filter((name) => name.endsWith(".yaml"))
    .map((name) => name.slice(0, -".yaml".length));

  it("are the four databases, three applications and the sample", () => {
    assert.deepEqual(ids, [
      "dataverse",
      "mysql",
      "oracle",
      "postgresql",
      "salesforce",
      "sample",
      "sap-odata",
      "sqlserver",
    ]);
  });

  for (const id of ids) {
    describe(id, () => {
      it("imports its synthetic result into the tables in expected.json", () => {
        const { document, notes } = importResult(id);
        const expected = JSON.parse(readFileSync(caseFile(id, "expected.json"), "utf8"));
        const tables = document.tables.map(({ object, columns }) => ({ object, columns }));
        assert.deepEqual(tables, expected);
        assert.deepEqual(notes, [], "every type in the result is one the recipe maps");
      });

      it("records where each table came from", () => {
        const { document, recipe, files } = importResult(id);
        for (const table of document.tables)
          assert.deepEqual(table.captured, {
            at: IMPORTED_AT,
            from: recipe.kind,
            recipe: id,
            // A recipe with one file for each object saves each table's own; any other, one file.
            file:
              files.length === 1 ? files[0].file : files.find((it) => it.object === table.object).file,
          });
        assert.deepEqual(document.names, recipe.names);
      });

      if (id === "sample")
        it("keeps no value from the sample's rows", () => {
          const { text } = importResult(id);
          assert.doesNotMatch(text, /ZZ-SECRET-42|Fabrikam/);
        });
      else
        // A catalog result holds no row of data, so no value can be planted in it: the test
        // pins that what is written is only the names, types and keys the result describes.
        it("writes only names, types and keys from a catalog result", () => {
          const { document } = importResult(id);
          const tableKeys = new Set(["object", "captured", "columns"]);
          const columnKeys = new Set([
            "name",
            "sourceType",
            "logicalType",
            "logicalTypeOptions",
            "required",
            "primaryKeyPosition",
          ]);
          const optionKeys = new Set(["precision", "scale", "maxLength"]);
          for (const table of document.tables) {
            assert.ok(Object.keys(table).every((key) => tableKeys.has(key)));
            for (const column of table.columns) {
              assert.ok(Object.keys(column).every((key) => columnKeys.has(key)));
              assert.ok(
                Object.keys(column.logicalTypeOptions ?? {}).every((key) => optionKeys.has(key)),
              );
            }
          }
        });
    });
  }

  for (const id of APPLICATIONS) {
    describe(`${id}'s result`, () => {
      const custom = CUSTOM[id];

      it("has a custom object or table and a custom field", () => {
        const { document } = importResult(id);
        const table = document.tables.find((it) => it.object === custom.object);
        assert.ok(table, `${custom.object} is in the tables`);
        assert.ok(table.columns.some((column) => column.name === custom.column));
      });

      // The result's labels, picklist values, defaults and descriptions are in it to be left out:
      // each carries `ZZ-` and a capital, which no name or type does. The test pins that they are
      // there, so that it is a test of what the import leaves out.
      it("keeps no label, value, default or description from the result", () => {
        const { files, text } = importResult(id);
        for (const { contents } of files) assert.match(contents, /ZZ-[A-Z]/);
        assert.doesNotMatch(text, /ZZ-[A-Z]/);
      });
    });
  }

  for (const id of DATABASES) {
    describe(`${id}'s query`, () => {
      const recipe = recipeOf(id);

      it("is a catalog query saved as sources/{connection}.catalog.csv", () => {
        assert.equal(recipe.kind, "catalog");
        assert.equal(recipe.read, "columns");
        assert.equal(recipe.ask.save, "sources/{connection}.catalog.csv");
      });

      it("returns the eight fields of the columns file, in order", () => {
        const alias = new RegExp(`\\bAS (${COLUMNS_FIELDS.join("|")})\\b`, "gi");
        const found = [...recipe.ask.run.matchAll(alias)].map((match) => match[1].toLowerCase());
        assert.deepEqual(found, COLUMNS_FIELDS);
      });

      it("is narrowed to the schemas the flows read", () => {
        assert.match(recipe.ask.run, /\bIN \(\{schemas\}\)/);
      });

      it("names how the source names a table", () => {
        assert.ok(recipe.names.parts >= 2);
        assert.equal(typeof recipe.names.caseSensitive, "boolean");
      });
    });
  }

  describe("the applications' asks", () => {
    for (const id of APPLICATIONS)
      it(`${id} says who, the access, the call and how to save the response`, () => {
        const { ask, kind } = recipeOf(id);
        assert.ok(kind === "catalog" || kind === "document");
        assert.ok(ask.who && ask.access && ask.call);
        assert.equal(ask.run, undefined);
        assert.match(ask.how, /curl/);
        assert.match(ask.how, /Postman/);
        // The token is a placeholder, and a password is never in the command.
        assert.doesNotMatch(ask.how, /Bearer [A-Za-z0-9._~+/-]{30,}/);
        assert.doesNotMatch(ask.how, /--user \S+:|-u \S+:/);
        // The folder under sources/ may not exist yet.
        assert.match(ask.how, /curl --create-dirs /);
      });

    it("salesforce calls the REST API's describe once for each object, with the instance and version", () => {
      const recipe = recipeOf("salesforce");
      assert.equal(recipe.kind, "catalog");
      assert.equal(recipe.read, "salesforce-describe");
      assert.equal(recipe.ask.call, "{instance}/services/data/v{version}/sobjects/{object}/describe");
      assert.equal(recipe.ask.save, "sources/{connection}/{object}.json");
      assert.deepEqual(Object.keys(recipe.inputs), ["instance", "version"]);
      assert.deepEqual(recipe.names, { parts: 1, caseSensitive: false });
      assert.match(recipe.ask.access, /API Enabled/);
    });

    it("salesforce replaces only its own object when one describe is imported again", () => {
      const recipe = recipeOf("salesforce");
      const { text, files } = importResult("salesforce");
      const again = files.find((it) => it.object === "Account");
      const result = importSource({
        connection: "crm",
        current: text,
        file: again.file,
        contents: again.contents,
        recipe,
        at: "2026-11-13T10:00:00Z",
      });
      assert.ok("text" in result);
      assert.deepEqual(result.changes, []);
      assert.equal(parse(result.text).tables.length, files.length);
    });

    it("dataverse downloads the Web API's $metadata, with tables named after entity types", () => {
      const recipe = recipeOf("dataverse");
      assert.equal(recipe.kind, "document");
      assert.equal(recipe.read, "odata");
      assert.equal(recipe.objects, "types");
      assert.equal(recipe.ask.call, "{organisation}/api/data/v9.2/$metadata");
      assert.equal(recipe.ask.save, "sources/{connection}.catalog.xml");
      assert.deepEqual(Object.keys(recipe.inputs), ["organisation"]);
    });

    it("dataverse names a lookup column <name>, as the copy tools do, not _<name>_value", () => {
      const recipe = recipeOf("dataverse");
      assert.deepEqual(recipe.columnNames, { match: "^_(.+)_value$", to: "$1" });
      const { files, document } = importResult("dataverse");
      assert.match(files[0].contents, /_primarycontactid_value/);
      const names = document.tables.flatMap((table) => table.columns.map((column) => column.name));
      assert.ok(names.includes("primarycontactid") && names.includes("new_accountid"));
      assert.ok(names.every((name) => !/^_.*_value$/.test(name)));
    });

    it("sap-odata downloads the service's $metadata, with tables named after entity sets", () => {
      const recipe = recipeOf("sap-odata");
      assert.equal(recipe.kind, "document");
      assert.equal(recipe.read, "odata");
      assert.equal(recipe.objects, undefined);
      assert.equal(recipe.ask.call, "{service}/$metadata");
      assert.equal(recipe.ask.save, "sources/{connection}.catalog.xml");
      assert.deepEqual(Object.keys(recipe.inputs), ["service"]);
    });
  });

  describe("sample", () => {
    it("asks for one file for each table, with no query", () => {
      const recipe = recipeOf("sample");
      assert.equal(recipe.kind, "sample");
      assert.equal(recipe.read, "sample");
      assert.equal(recipe.ask.save, "sources/{connection}/{object}.csv");
      assert.equal(recipe.ask.run, undefined);
      assert.equal(recipe.ask.call, undefined);
    });
  });
});

const madeFolders = [];

/** A copy of the repository's sample recipe in a new folder, removed after the test. */
function copyOfRecipes() {
  const folder = mkdtempSync(join(tmpdir(), "recipes-test-"));
  madeFolders.push(folder);
  mkdirSync(join(folder, "recipes"));
  cpSync(recipeFile("sample"), join(folder, "recipes", "sample.yaml"));
  return folder;
}

describe("check-recipes", () => {
  afterEach(() => {
    for (const folder of madeFolders.splice(0)) rmSync(folder, { recursive: true, force: true });
  });

  it("passes every recipe in this repository", () => {
    const result = runScript("check-recipes.mjs", repo);
    assert.equal(result.status, 0, result.output);
    for (const id of [
      "sqlserver",
      "oracle",
      "mysql",
      "postgresql",
      "salesforce",
      "dataverse",
      "sap-odata",
      "sample",
    ])
      assert.match(result.output, new RegExp(`ok +recipes/${id}\\.yaml`));
  });

  it("is run by `check`, with the kit checks, and by name for a recipe", () => {
    const all = runScript("check.mjs", repo);
    assert.equal(all.status, 0, all.output);
    assert.match(all.output, /recipes\/sqlserver\.yaml/);
    assert.match(all.output, /kits\//);
    const named = runScript("check.mjs", repo, ["recipes/oracle.yaml"]);
    assert.equal(named.status, 0, named.output);
    assert.match(named.output, /recipes\/oracle\.yaml/);
    assert.doesNotMatch(named.output, /kits\//);
  });

  it("sends a path to the recipe check when it resolves inside recipes/, however it is written", () => {
    const spellings = [
      "./recipes/oracle.yaml",
      "kits/../recipes/oracle.yaml",
      join(repo, "recipes", "oracle.yaml"),
    ];
    for (const spelling of spellings) {
      const result = runScript("check.mjs", repo, [spelling]);
      assert.equal(result.status, 0, `${spelling}: ${result.output}`);
      assert.match(result.output, /ok +recipes\/oracle\.yaml/, spelling);
      assert.doesNotMatch(result.output, /kits\//, spelling);
    }
  });

  it("sends a path outside recipes/ to the kit check, even one that starts like it", () => {
    for (const path of ["recipes-old/oracle.yaml", "kits/duckdb/local-medallion/2026-11-10"]) {
      const result = runScript("check.mjs", repo, [path]);
      assert.doesNotMatch(result.output, /recipes\/oracle/, path);
    }
  });

  it("fails a recipe whose id is not its file's name", () => {
    const folder = copyOfRecipes();
    cpSync(join(folder, "recipes", "sample.yaml"), join(folder, "recipes", "other.yaml"));
    const result = runScript("check-recipes.mjs", folder);
    assert.equal(result.status, 1);
    assert.match(result.output, /FAIL +recipes\/other\.yaml/);
    assert.match(result.output, /ok +recipes\/sample\.yaml/);
  });

  it("fails a recipe with no source", () => {
    const folder = copyOfRecipes();
    const path = join(folder, "recipes", "sample.yaml");
    writeFileSync(path, readFileSync(path, "utf8").replace(/^sources:[\s\S]*$/m, "sources: []\n"));
    const result = runScript("check-recipes.mjs", folder);
    assert.equal(result.status, 1);
    assert.match(result.output, /sources/);
  });

  it("fails a source read after today, naming it", () => {
    const folder = copyOfRecipes();
    const path = join(folder, "recipes", "sample.yaml");
    const text = readFileSync(path, "utf8");
    writeFileSync(path, text.replace(/(jsonlines\.org\/", read: )2026-11-12/, "$12999-01-01"));
    const result = runScript("check-recipes.mjs", folder);
    assert.equal(result.status, 1);
    assert.match(result.output, /https:\/\/jsonlines\.org\/ was read on 2999-01-01, which is after today/);
  });

  it("accepts a source read on the day it is checked, not the day before", () => {
    const folder = copyOfRecipes();
    const path = join(folder, "recipes", "sample.yaml");
    const text = readFileSync(path, "utf8");
    writeFileSync(path, text.replaceAll("read: 2026-11-12", "read: 2026-11-13"));
    assert.deepEqual(recipeProblems(folder, path, "2026-11-13").problems, []);
    assert.equal(recipeProblems(folder, path, "2026-11-12").problems.length, 3);
  });

  it("takes today as the later of the date here and the date in UTC", () => {
    assert.equal(today(new Date(2026, 10, 12, 12, 0, 0)), "2026-11-12");
    const now = new Date();
    assert.ok(today(now) >= now.toISOString().slice(0, 10));
  });

  it("fails a file that is not <id>.yaml", () => {
    const folder = copyOfRecipes();
    writeFileSync(join(folder, "recipes", "notes.txt"), "not a recipe\n");
    const result = runScript("check-recipes.mjs", folder);
    assert.equal(result.status, 1);
    assert.match(result.output, /FAIL +recipes\/notes\.txt/);
    assert.deepEqual(
      allRecipeFiles(folder).map((file) => file.slice(folder.length + 1)),
      ["recipes/notes.txt", "recipes/sample.yaml"],
    );
  });
});
