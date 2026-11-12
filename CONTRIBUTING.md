# Contributing

This repository holds kits: small, complete Ingestron projects that someone
has checked and dated. It also holds recipes: how to get the metadata of one
kind of source, such as the query a database team runs. The formats are in the
Ingestron specification (`spec/cli/kits.md` and `spec/cli/sources.md` in the
`ingestron/ingestron` repository). This page says how to add a kit or a recipe
here.

## Add a kit

1. Make the folder `kits/<platform>/<name>/<version>/`. The id is
   `<platform>/<name>` and the version is today's date, `YYYY-MM-DD`, or
   `YYYY-MM-DD-preview`.
2. Put these files in it: `kit.yaml`, `standard.yaml`, `platform.yaml`,
   `project.yaml` and `README.md`, with the project's `connections/`,
   `flows/`, `contracts/` and `transforms/` folders.
3. Write one connection, one flow, one contract and one transform that build.
   Every value only a team can know is `REPLACE_ME`, with a comment above it
   that says what to write.
4. Use synthetic data only. No credentials, no customer data, no cloud access.
5. In the README, explain each choice in plain words and give the platform
   source and the date you read it. Name every intent section the Standard
   writes in backticks, as in `load`, `history`, `audit` or `operations`. The
   check looks for the name between backticks; the plain word does not count.
6. Run the checks (below), then open a pull request.

## Add a recipe

A recipe is one file, `recipes/<id>.yaml`. It says what to ask a source's
team for, how Ingestron reads the answer, how the source names a table and how
its types map to logical types. Ingestron never connects to the source: the
team runs the query and saves the result.

1. Read the vendor's current documentation for the source's catalog (the
   views or tables that describe its columns, keys and types) and for its data
   types. Use the vendor's own pages only.
2. Write `recipes/<id>.yaml`. The id is lower case and is the file's name.
   Under `sources`, list each page you used with the date you read it,
   `YYYY-MM-DD`.
3. For a database, write a query that returns the eight fields of the columns
   file, named as the specification names them and in its order, with
   `data_type` as the source prints the type, length, precision and scale
   included, such as `nvarchar(200)` or `decimal(18,2)`. Take the primary key
   position from the catalog's constraint views, and narrow the query with
   `WHERE <schema column> IN ({schemas})`. Save the result at
   `sources/{connection}.catalog.csv`.
4. Give `types` a rule for every type the vendor documents, so that no column
   needs a guess. Capture precision, scale and length where the type gives them.
5. Write `ask` for the people who will run the query: who they are, the exact
   permission the query needs, and how to save the result as CSV with a header
   row. Run no query against a real source: check the query by reading the
   vendor's documentation.
6. Add `test/recipes/<id>/result.csv`, a synthetic result exactly as the query
   returns it (`result.xml` or `result.json` for a call), and `test/recipes/<id>/expected.json`, the tables Ingestron
   should write from it. The result needs a table with a key of two columns, a
   column that can be null, a decimal, a table in a second schema, and one
   column of each type the query can return, so that the import reports no
   unknown type. Use invented names only.
7. Run the checks (below), then open a pull request.

An input a team seldom needs to set can have a `default`, the text the request
uses when the connection gives no value for it. It may hold `{object}`, which
the request fills in with each table's name, as the schema registry recipe's
`subject` does (`{object}-value`).

For an application, such as Salesforce, give `ask` a `call` (a URL, with each
value only a team knows as a placeholder such as `{instance}`) in place of a
`run` query, and write `access` as the permission or role the call needs. Say
in `how` how to save the response from a browser, with `curl` and with Postman,
and show a token only as a placeholder. The `read` is the reader of the
response, such as `odata` for a `$metadata` document. Include in the synthetic
result a custom object or table and a custom field, and values in descriptive
fields, such as labels and picklist values, which the test checks are never
written. A call made once for each object has one result file for each object in
`test/recipes/<id>/results/`, named after the object.

## Run the checks

Use Node 22 or later.

```sh
npm ci
npm run check
npm run index
npm test
```

`npm ci` installs the CLI, `@ingestron/core`, and `ajv` and `yaml`, which the
tests use, pinned to the versions `@ingestron/config` uses. `npm ci` needs
`package-lock.json`, which the first `npm install` writes at release time.
Until then, the tests take `ajv` and `yaml` from `@ingestron/config`, which
comes with `@ingestron/core`.

`npm run check` takes each kit and checks that:

- `kit.yaml` and the other files follow the format;
- `ingestron plan` runs on a copy of the kit with no error;
- that plan has no warning but `REPLACE_ME`, the values a kit leaves for its
  user to write: no `NOT_APPLIED`, and no `PREVIEW_FEATURE` in a kit with
  `features: ga`;
- its `platform.yaml` has no `accept` list: a kit accepts no warning, so none
  is hidden from the check above;
- the README names every intent section the Standard writes, in backticks;
- the kit has not changed since its tag, when it has one.

Name kit folders to check only those:
`npm run check -- kits/duckdb/local-medallion/2026-11-10`.

`npm run check` also takes each file in `recipes/` and checks that:

- the file follows the recipe format: its id is its file's name, its `ask` is
  complete, each `match` is a regular expression and there is at least one
  source;
- no source was read after today;
- the folder holds no file but `<id>.yaml` recipes.

Name recipes to check only those: `npm run check -- recipes/oracle.yaml`.
`npm test` imports each recipe's synthetic result with Ingestron's own import
and compares the tables with `expected.json`.

`npm run index` rewrites `index.json` from the folders and tags. Commit the
result. The pull request check fails when `index.json` is out of date. After
tagging a version, a maintainer runs `npm run index` again and commits
`index.json`, so each version lists the commit of its tag.

`npm test` also builds each kit that uses the Databricks pack and checks the
bundle against the bundle schema of the Databricks CLI. The schema is not
stored in this repository: the test runs `databricks bundle schema` on the
Databricks CLI you have installed, which must be v1.23.0 or later, and passes
it through `scripts/trim-bundle-schema.mjs`. That script drops the
descriptions and leaves open three model serving definitions no kit uses.
Without the Databricks CLI, the test is skipped and says why. Install it with
[Databricks' instructions](https://docs.databricks.com/aws/en/dev-tools/cli/install);
the pull request check installs v1.23.0.

`INGESTRON_CLI` is the path of the CLI's JavaScript file. Set it to check
against a build you made yourself. Without it, the checks use the installed
`@ingestron/cli`.

## Version rules

- A version is a git tag `<id>@<version>`, added by a maintainer when the
  pull request is merged.
- A kit never changes after its tag. To fix or update one, add a new version
  in a new folder, set `replaces` to the version before it, and describe what
  changed in `notes`. The check fails a change to a tagged folder.
- The date is the day you checked the kit's features against the packs.
- A version without `-preview` uses only features that are generally
  available. If the plan reports `PREVIEW_FEATURE`, remove the feature or make
  the version a `-preview` one with `features: preview`.
- Several versions of a kit may stay current. Do not delete old versions.

## Licence

This repository is licensed under the [Apache License 2.0](LICENSE). By
contributing, you agree that your contribution is licensed under the same
terms.

Every commit is signed off under the
[Developer Certificate of Origin 1.1](https://developercertificate.org/): add
`-s` to `git commit`, which appends `Signed-off-by: Your Name <you@example.com>`
matching the commit author.
