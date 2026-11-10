# Local medallion on DuckDB

Sample orders loaded into a local DuckDB database in two layers. The `bronze`
layer holds the orders as they arrive in the file. The `silver` layer holds a
SQL total per customer, with one row per customer, its text trimmed and
checked. A row the check leaves out is kept apart, with the name of the check
it failed. Both tables are published as Parquet. Nothing to set up but the
DuckDB command line, and nothing to replace: the project runs as written.

This kit is version 2026-11-10. It uses only DuckDB features that are
generally available.

| File                              | What it shows                                           |
| --------------------------------- | ------------------------------------------------------- |
| `standard.yaml`                   | The layers, what each one does and keeps, and CSV files |
| `platform.yaml`                   | `published`: the folder each table is published to      |
| `connections/shop.yaml`           | A files source in the project folder, `./samples`       |
| `flows/orders.yaml`               | `samples/orders.csv` becomes the table `bronze.orders`  |
| `transforms/customer_totals.yaml` | SQL over the orders, kept as `silver.customer_totals`   |
| `contracts/*.yaml`                | ODCS contracts: the columns, their types and the key    |

## Run it

From the project folder:

```sh
ingestron apply
duckdb -bail ingestron.duckdb -c ".read build/duckdb/dev/run.sql"
duckdb ingestron.duckdb "SELECT * FROM silver.customer_totals"
```

The run prints its check, `customer_not_null`, with `0` failing rows. The query
then shows three customers: Ana with 2 orders, Ben with 2 and Chen with 1.
Each run also writes `published/bronze.orders.parquet` and
`published/silver.customer_totals.parquet`, which Power BI and other tools read
as files.

To see each run's checks, and the rows they left out:

```sh
duckdb ingestron.duckdb "SELECT * FROM silver._ingestron_checks"
duckdb ingestron.duckdb "SELECT * FROM silver.customer_totals_quarantine"
```

Running again is safe. `-bail` stops at the first error, and the tables are
built in one transaction, so a failed run publishes nothing.

## What the Standard decides

`standard.yaml` writes these kinds of intent. A table in `bronze` and a table in
`silver` each start from their layer's values. The flow's table goes in the
first layer and the transform's table in the second.

| Section   | Where it is                                               | What it does on DuckDB                                                                                          |
| --------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `layers`  | `bronze`, then `silver`                                   | Each table is created in the DuckDB schema named for its layer.                                                 |
| `does`    | `bronze`: `raw`                                           | The table keeps every row as it arrived: nothing is cleansed, checked or left out.                              |
|           | `silver`: `cleanse`, `deduplicate`, `check`, `quarantine` | The table's text is cleansed, its checks run, and the rows they leave out are kept apart.                       |
| `load`    | `default: full`                                           | Every file the flow names is read again each run.                                                               |
| `history` | `silver`: `latest`                                        | One row per primary key: a new row with the same key replaces the old one; rows the query stops returning stay. |
| `audit`   | `bronze`: `loaded_at`, `source_file`                      | Two columns are added after the contract's columns.                                                             |
|           | `silver`: `loaded_at`                                     | One column is added after the contract's columns.                                                               |
| `cleanse` | `text`, `timestamps`                                      | In `silver`, text is trimmed and an empty text becomes null; timestamps would be converted to UTC.              |
| `quality` | `required: drop`, `results: true`                         | In `silver`, a row missing a required value is left out; each check's result is kept in a table.                |
|           | `silver`: `quarantine: true`                              | The rows a check leaves out are kept in `silver.customer_totals_quarantine`.                                    |

`bronze` does not write `history`. A table that reads files keeps the rows as
they arrived, so each run replaces the table.

### `layers`

Bronze is the first layer and silver the second. DuckDB makes a schema for each
layer, so the tables are `bronze.orders` and `silver.customer_totals`. There is
no third layer: this kit stops at silver.

Each layer says what it does with its rows in `does`:

- `bronze` does `raw`. It keeps every row as it arrived, so you can always see
  what the file held. Nothing in it is cleansed, and DuckDB checks no row in a
  layer whose `does` does not list `check`. That is why
  `contracts/orders.yaml` marks no column `required`: a required column there
  would only be reported as not applied.
- `silver` does `cleanse`, `deduplicate`, `check` and `quarantine`. Its table
  is cleansed and checked, and the rows a check leaves out are kept apart.
  `deduplicate` lets a table in `silver` write `deduplicate` under its
  `cleanse`, which keeps one row per key in a table that is replaced each run.
  The kit's own silver table does not need it: `history: latest` already keeps
  one row per customer, and Ingestron would only warn that it is redundant.

### `load`

`load: default: full` reads the whole file every run. Replace the CSV file and
run again to see the table change. DuckDB reads CSV files with `read_csv`, and
the `header` and `delim` options say the first row holds the column names and
a comma separates the values. DuckDB's pages on importing data and on reading
CSV files describe these options (accessed 2026-11-01):

- [Importing data](https://duckdb.org/docs/2.0/data/overview)
- [CSV import](https://duckdb.org/docs/2.0/data/csv/overview)

The kit does not use the other `load` modes (`files`, `incremental` and
`changes`). The DuckDB pack does not build them yet, and `ingestron plan` would
report them as not applied.

### `history`

`history: latest` on `silver` keeps the newest row for each customer, using the
primary key in `contracts/customer_totals.yaml`. Ingestron writes it as DuckDB's
`INSERT OR REPLACE`. A history of `latest` needs a primary key, and this
contract has one: `customer`. Rows that the query stops returning stay in the
table. If the same key appeared twice in a run, you would add a `sequence`
column to say which row is newer.

Source, accessed 2026-11-09:
[INSERT](https://duckdb.org/docs/2.0/sql/statements/insert).

### `audit`

`audit` adds columns that say where and when a row was written. They come after
the contract's columns, are not part of the contract, and are kept in the table
and in the published Parquet file. Ingestron names each one with a leading
underscore.

- `loaded_at` becomes `_loaded_at`. It holds DuckDB's `now()`, the time of the
  run, as a `TIMESTAMP WITH TIME ZONE`. It is in both layers. Every row of one
  run shares the same value.
- `source_file` becomes `_source_file`. It holds the path of the file a row came
  from, as text. It is only in `bronze`, because a transform reads a table and
  no file.

Sources, accessed 2026-11-09:

- [Timestamp with time zone functions](https://duckdb.org/docs/2.0/sql/functions/timestamptz)
  for `now()`.
- [Reading and writing Parquet files](https://duckdb.org/docs/2.0/data/parquet/overview)
  and [Reading multiple files](https://duckdb.org/docs/2.0/data/multiple_files/overview)
  for the `filename` option, which names each row's file.

### `cleanse`

`cleanse` gives every table in a layer that cleanses, here `silver`, the same
treatment of its columns:

- `text: { trim: true, empty: null }`: each text column, one whose
  `logicalType` is `string`, has its leading and trailing spaces removed, and a
  value left empty becomes null. In `silver.customer_totals` that is `customer`, written
  `nullif(trim(customer), '')`, so a blank customer is null, which the check
  below then finds.
- `timestamps: { to: UTC }`: each timestamp column is converted to UTC from
  the zone its source writes in. A connection with no `timezone` is in UTC,
  and the sample orders hold dates, not times, so nothing is converted here.
  If your files hold times written in, say, London, add
  `timezone: Europe/London` to `connections/shop.yaml`, and `silver` converts
  them with `AT TIME ZONE`.

Cleansing happens to the rows the transform's query returns. The query adds up
orders per customer, so `transforms/customer_totals.yaml` groups by the
customer cleansed the same way: `" Ana"` and `"Ana"` are then one customer. Were
it to group by `customer` as it is, they would be two rows with the same key
after cleansing, and `history: latest` would keep only one of them.

Sources, accessed 2026-11-10:
[Text functions](https://duckdb.org/docs/2.0/sql/functions/text) for `trim`,
[Utility functions](https://duckdb.org/docs/2.0/sql/functions/utility) for
`nullif`, and
[Timestamp with time zone functions](https://duckdb.org/docs/2.0/sql/functions/timestamptz)
for `AT TIME ZONE`, whose time zones come from the
[ICU extension](https://duckdb.org/docs/2.0/core_extensions/icu) that DuckDB's
command line includes.

### `quality`

- `required: drop` leaves out a row that is missing a value the contract says
  is required. `contracts/customer_totals.yaml` says `customer` is required, so
  `silver.customer_totals` has the check `customer_not_null`. The table's
  primary key is `customer`, and a row with no key could not be kept by key.
  In `bronze`, which does `raw`, an action is never more than a count.
- `results: true` keeps each check's result in `silver._ingestron_checks`: the
  run's id, when it ran, the table, the check, its action, how many rows
  failed, and whether it passed. Each run adds its rows, in the same
  transaction as the tables, so a run that stops leaves none.
- `quarantine: true` on `silver` keeps the rows a `drop` check leaves out in
  `silver.customer_totals_quarantine`, with a column `_failed_checks` that
  names the checks each row failed. It is rebuilt each run and is not
  published.

The run also prints each check with its failing rows. The checks see the
cleansed values, so a blank customer is caught.

Sources, accessed 2026-11-10:
[Utility functions](https://duckdb.org/docs/2.0/sql/functions/utility) for
`coalesce`, `error`, `uuid` and `getvariable`;
[List functions](https://duckdb.org/docs/2.0/sql/functions/list) for
`list_filter`, which builds `_failed_checks`;
[INSERT](https://duckdb.org/docs/2.0/sql/statements/insert) and
[Transactions](https://duckdb.org/docs/2.0/sql/statements/transactions).

### The command line

`-bail` and `.read` come from DuckDB's command line page, accessed 2026-11-01:
[Command line](https://duckdb.org/docs/2.0/clients/cli/overview). The
transaction around the build is described on the
[Transactions](https://duckdb.org/docs/2.0/sql/statements/transactions) page,
accessed the same day.

## Make it yours

This folder is your project now. Change it as you like and keep it in Git.

- Put your own CSV files in `samples/`, change `object` in
  `flows/orders.yaml`, and update `contracts/orders.yaml` to match the columns.
- Add checks where `does` lists `check`: in `silver`, in
  `contracts/customer_totals.yaml`.
- To keep a table's rows as they arrive in `silver` too, change its `history`
  in `standard.yaml` to `none`.
- Run `ingestron plan` after each change. It lists what Ingestron would write
  and reports anything the pack cannot apply.
