# Contributing

This repository holds kits: small, complete Ingestron projects that someone
has checked and dated. The format of a kit is in the Ingestron specification
(`spec/cli/kits.md` in the `ingestron/ingestron` repository). This page says
how to add one here.

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
- a kit with `features: ga` has no `PREVIEW_FEATURE` warning in that plan;
- the README names every intent section the Standard writes, in backticks;
- the kit has not changed since its tag, when it has one.

Name kit folders to check only those:
`npm run check -- kits/duckdb/local-medallion/2026-11-10`.

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
