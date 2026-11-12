# Ingestron standards

A kit is a small, complete Ingestron project that has been checked and dated.
It holds a Standard, a Platform skeleton, a `project.yaml`, and one connection,
flow, contract and transform that build. You start a project from a kit, and
later move to a newer kit when you want a newer Standard.

This repository holds Ingestron's own kits and source recipes. The same
folders are published to npm as `@ingestron/standards`, so `ingestron init --kit`
works offline for the kits.

## Find a kit

Kits live in `kits/<platform>/<name>/<version>/`, for example
`kits/duckdb/local-medallion/2026-11-10/`. Each kit's `README.md` says what the
kit does, why each choice was made and what you must fill in.
[`index.json`](index.json) lists every kit and version.

## Find a recipe

A recipe says how to get the metadata of one kind of source: the query its
team runs or the API call it makes, how Ingestron reads the result, how the
source names a table and how its types map to logical types. Recipes live in
`recipes/<id>.yaml`. The first ones are `sqlserver`, `oracle`, `mysql`,
`postgresql`, `salesforce`, `dataverse`, `sap-odata`, `odata`, `openapi`,
`schema-registry` and `sample`. Each lists
the vendor documentation it comes from, with the date it was read. Ingestron
never connects to a source: someone with access runs the query or the call and
saves the result under `sources/`. A source with no recipe is covered by a
sample of its data or by a columns file, which a person writes from the source.

## Start a project from a kit

Run this in an empty folder:

```sh
ingestron init --kit duckdb/local-medallion@2026-11-10
```

Ingestron copies the kit into the folder. Every value only your team knows is
`REPLACE_ME`, with a comment above it that says what to write. Write each one,
then run `ingestron plan`.

Give only the kit's id, such as `duckdb/local-medallion`, to take its newest
version that is not a preview: the newest among the versions installed with
Ingestron and the tags in this repository. When this repository cannot be
reached, Ingestron takes the newest installed version and says so first.

## Move to a newer kit

Run this in your project:

```sh
ingestron standard install duckdb/local-medallion@2026-12-01
git diff
```

`ingestron standard install` replaces your Standard with the kit's, keeping its
path and its `id`, and says what changed. Read `git diff` before you commit:
the new Standard may change the files Ingestron generates.

## Versions

A kit's version is a date, `2026-11-10`, and a git tag `<id>@<version>`, such
as `duckdb/local-medallion@2026-11-10`. The date is the day its features were
checked against the packs.

- A kit never changes once it is published. A change is a new version in a new
  folder.
- A version that ends `-preview`, such as `2026-11-10-preview`, may use
  platform features that are still in preview. Any other version uses only
  features that are generally available.
- Several versions of a kit can be current at the same time.

## Propose a kit or a recipe

Read [CONTRIBUTING.md](CONTRIBUTING.md). It says what a kit or a recipe must
hold and how to check it before you open a pull request.

## Licence

Apache License 2.0. See [LICENSE](LICENSE).
