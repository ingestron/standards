# Local medallion on DuckDB

Sample orders loaded into a local DuckDB database in two layers. The `bronze`
layer holds the orders as they arrive in the file. The `silver` layer holds a
SQL total per customer, with one row per customer. Both tables are published
as Parquet. Nothing to set up but the DuckDB command line, and nothing to
replace: the project runs as written.

This kit is version 2026-11-10. It uses only DuckDB features that are
generally available.

| File                              | What it shows                                          |
| --------------------------------- | ------------------------------------------------------ |
| `standard.yaml`                   | The layers and what each one keeps, and CSV files      |
| `platform.yaml`                   | `published`: the folder each table is published to     |
| `connections/shop.yaml`           | A files source in the project folder, `./samples`      |
| `flows/orders.yaml`               | `samples/orders.csv` becomes the table `bronze.orders` |
| `transforms/customer_totals.yaml` | SQL over the orders, kept as `silver.customer_totals`  |
| `contracts/*.yaml`                | ODCS contracts: the columns, their types and the key   |

## Run it

From the project folder:

```sh
ingestron apply
duckdb -bail ingestron.duckdb -c ".read build/duckdb/dev/run.sql"
duckdb ingestron.duckdb "SELECT * FROM silver.customer_totals"
```

You should see three customers: Ana with 2 orders, Ben with 2 and Chen with 1.
Each run also writes `published/bronze.orders.parquet` and
`published/silver.customer_totals.parquet`, which Power BI and other tools read
as files.

Running again is safe. `-bail` stops at the first error, and the tables are
built in one transaction, so a failed run publishes nothing.

## What the Standard decides

`standard.yaml` writes four kinds of intent. A table in `bronze` and a table in
`silver` each start from their layer's values. The flow's table goes in the
first layer and the transform's table in the second.

| Section   | Where it is                          | What it does on DuckDB                                                             |
| --------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| `layers`  | `bronze`, then `silver`              | Each table is created in the DuckDB schema named for its layer.                    |
| `load`    | `default: full`                      | Every file the flow names is read again each run.                                  |
| `history` | `silver`: `latest`                   | The table keeps one row per primary key. Rows from a new run replace the old ones. |
| `audit`   | `bronze`: `loaded_at`, `source_file` | Two columns are added after the contract's columns.                                |
|           | `silver`: `loaded_at`                | One column is added after the contract's columns.                                  |

`bronze` does not write `history`. A table that reads files keeps the rows as
they arrived, so each run replaces the table.

### `layers`

Bronze is the first layer and silver the second. DuckDB makes a schema for each
layer, so the tables are `bronze.orders` and `silver.customer_totals`. There is
no third layer: this kit stops at silver.

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
- To keep a table's rows as they arrive in `silver` too, change its `history`
  in `standard.yaml` to `none`.
- Run `ingestron plan` after each change. It lists what Ingestron would write
  and reports anything the pack cannot apply.
