# Streaming lakehouse on Databricks

A web shop's files loaded into Databricks in three layers. The `bronze` layer
holds customers as they arrive in the files, a row each time a customer is
exported. The `silver` layer holds one row per order, kept current from change
records. Orders skip `bronze`: the changes as received are kept in `silver`
beside the current rows. The `gold` layer holds order totals per customer and
day. One Lakeflow pipeline builds the tables, and one
job refreshes it each day, tries again when it fails and mails your team when
it still fails.

This kit is version 2026-11-10. It uses only Databricks features that are
generally available.

| File                          | What it shows                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `standard.yaml`               | The layers and what each one keeps, and how the job runs                                 |
| `platform.yaml`               | The schedule, who is told of failures, and the `databricks:` part                        |
| `project.yaml`                | The `dev` and `prod` environments and their own values                                   |
| `connections/shop.yaml`       | The volume the shop's files land in                                                      |
| `flows/customers.yaml`        | `customers/` becomes the streaming table `bronze.customers`                              |
| `flows/orders.yaml`           | `orders/` becomes `silver.orders`, the latest row per order, and `silver.orders_changes` |
| `transforms/daily_sales.yaml` | SQL over both, kept as the materialised view `gold.daily_sales`                          |
| `contracts/*.yaml`            | ODCS contracts: the columns, their types, the key and the checks                         |

## Start a project from this kit

Run this in an empty folder:

```sh
ingestron init --kit databricks/lakehouse-streaming@2026-11-10
```

Ingestron copies the kit into the folder. Then write each value that is still
`REPLACE_ME`. The comment above each one says what it is, and your editor's
hover says where to find it.

| Where                                         | What to write                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `project.yaml`, `engineers`                   | The group that manages the pipeline and job                                                    |
| `project.yaml`, `analysts`                    | The group that may view the pipeline and job                                                   |
| `project.yaml`, `host` in `dev` and `prod`    | Each workspace's URL, from the address bar when you are signed in                              |
| `project.yaml`, `landing` in `dev` and `prod` | The volume the files land in, such as `/Volumes/dev_sales/landing/shop`, from Catalog Explorer |
| `platform.yaml`, `alerts` `to`                | The address told when a run fails, such as your team's shared mailbox                          |
| `platform.yaml`, `service_principal_name`     | The application ID of the service principal the pipeline and job run as                        |

Find the service principal and the groups in your workspace under Settings,
then Identity and access, then Manage next to Service principals or Groups.
Then run:

```sh
ingestron plan
```

The plan lists the files Ingestron would write. It says how many values are
still `REPLACE_ME`; `ingestron check` fails until each one is written. When
none is left, run `ingestron apply` and deploy the bundle in `build/databricks`
with `databricks bundle deploy -t dev`.

## What the Standard decides

`standard.yaml` writes these kinds of intent. A table starts from its layer's
values. A flow's tables go in the first layer unless the flow names another,
and a transform's table goes in the layer it names.

| Section      | Where it is                              | What it does on Databricks                                                    |
| ------------ | ---------------------------------------- | ----------------------------------------------------------------------------- |
| `load`       | `default: files`                         | Auto Loader reads each new file once, with `read_files`.                      |
| `audit`      | `bronze` and `silver`                    | Two columns, `_loaded_at` and `_source_file`, are added to each table there.  |
| `rescued`    | `bronze`                                 | In `bronze.customers`, values that do not fit are kept in `_rescued_data`.    |
| `history`    | `silver`: `latest`                       | AUTO CDC keeps the latest row per key, as SCD type 1.                         |
| `storage`    | `clustering: auto`                       | `CLUSTER BY AUTO` on every table but `silver.orders_changes`.                 |
| `quality`    | `required: drop`, `results: true`        | Rows missing a required value are left out; the event log is kept as a table. |
| `operations` | retries, timeout, concurrency and alerts | The refresh job's retries, time limit, queue and failure emails.              |

### `load`

`load: default: files` reads each new file in the connection's folder once.
Ingestron writes it as a streaming table over `STREAM read_files(...)`, which
is Auto Loader. A file that was read is not read again, so a run takes only
what arrived since the last one.

Sources, accessed 2026-11-09:
[Auto Loader](https://docs.databricks.com/aws/en/ingestion/cloud-object-storage/auto-loader/)
and [read_files](https://docs.databricks.com/aws/en/sql/language-manual/functions/read_files).

### `audit`

`audit: [loaded_at, source_file]` adds two columns after the contract's
columns, in `bronze.customers`, `silver.orders_changes` and `silver.orders`:

- `_loaded_at` holds `current_timestamp()`, when the row was read.
- `_source_file` holds `_metadata.file_path`, the file the row came from.

`gold` has no audit columns: a materialised view reads tables, not files.

Source, accessed 2026-11-09:
[File metadata column](https://docs.databricks.com/aws/en/ingestion/file-metadata-column).

### `rescued`

`rescued: true` on `bronze` keeps what does not fit the contract, such as a
column the files gained or a value of the wrong type, in the `_rescued_data`
column of `bronze.customers`. Nothing is lost, and you can look for problems
with `WHERE _rescued_data IS NOT NULL`. `silver` does not set `rescued`, so
`silver.orders_changes` has no `_rescued_data` column. To keep one for orders
too, add `rescued: true` to the `silver` layer.

Source, accessed 2026-11-09:
[Auto Loader schema](https://docs.databricks.com/aws/en/ingestion/cloud-object-storage/auto-loader/schema).

### `history` and `sequence`

`history: latest` on `silver` keeps one row per order. The files hold change
records, so `flows/orders.yaml` says which change is newer and which one is a
delete:

- `sequence: updated_at`: the change with the latest `updated_at` wins.
- `load: deletes: when: "op = 'D'"`: a change with `op = 'D'` removes the
  order.

Ingestron writes this as AUTO CDC with `KEYS`, `SEQUENCE BY`,
`APPLY AS DELETE WHEN` and `STORED AS SCD TYPE 1`. The changes as received are
kept beside the table, in `silver.orders_changes`. The key is the primary key
in `contracts/orders.yaml`.

Source, accessed 2026-11-09: [AUTO CDC](https://docs.databricks.com/aws/en/ldp/cdc).

### `storage`

`storage: clustering: auto` creates `bronze.customers`, `silver.orders` and
`gold.daily_sales` with `CLUSTER BY AUTO`, so Databricks chooses the clustering
columns from how each table is queried. `silver.orders_changes`, the changes
as received, has no `CLUSTER BY`: the Databricks pack does not apply
`storage` to it.
Databricks recommends liquid clustering for all new tables, and
`CLUSTER BY AUTO` is generally available.

Source, accessed 2026-11-09:
[Liquid clustering](https://docs.databricks.com/aws/en/delta/clustering).

### `quality`

- `required: drop` leaves out a row that is missing a value the contract
  says is required, in `bronze.customers`, `silver.orders` and
  `gold.daily_sales`. The pipeline records how many rows each check dropped.
  `silver.orders_changes` has no checks: it keeps every change as received.
- `results: true` keeps the pipeline's event log as a table, `<pipeline>_event_log`
  in the `bronze` schema, so you can query how many rows passed and failed each
  check.

The silver contract also has checks over all rows: there is at least one
order, and no order id appears twice. A pipeline cannot count over all rows,
so `platform.yaml` turns on `manage: checks: true`, and the job runs these
checks after each refresh. `ingestron apply` writes the privileges they need
in `prerequisites/<environment>.sql`.

Source, accessed 2026-11-09:
[Pipeline event log](https://docs.databricks.com/aws/en/ldp/monitor-event-logs).

### `operations`

| Setting                                     | On the refresh job                                        |
| ------------------------------------------- | --------------------------------------------------------- |
| `retries: { count: 2, interval: 5m }`       | A failed refresh is tried twice more, five minutes apart. |
| `timeout: 2h`                               | A run that takes over two hours is stopped.               |
| `concurrency: { max_runs: 1, queue: true }` | One run at a time; a run that starts meanwhile waits.     |
| `alerts: { on: [failure] }`                 | A failed run mails the address in `platform.yaml`.        |

Where to send alerts is in `platform.yaml`, because it is your team's, not the
organisation's. The kit does not alert on slow runs: Databricks' run duration
threshold is in Public Preview.

Sources, accessed 2026-11-09:
[Configure a task](https://docs.databricks.com/aws/en/jobs/configure-task),
[Configure a job](https://docs.databricks.com/aws/en/jobs/configure-job) and
[Job notifications](https://docs.databricks.com/aws/en/jobs/notifications).

## Each customer counted once

`bronze.customers` keeps every row the shop exports, and the shop exports every
hour, so the same customer can appear in several files. Joined as it is, a
customer with three rows would count each order three times.
`transforms/daily_sales.sql` therefore takes each customer's latest row first,
by `updated_at`, with `QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY
updated_at DESC, ...) = 1`, and joins the orders to that. When two rows of a
customer have the same `updated_at`, the one read last wins (`_loaded_at`),
then the one from the later file (`_source_file`), then the first `email` in
order, so every run picks the same row. `bronze` keeps the full record of what
arrived, and `gold` counts each customer once.

Source, accessed 2026-11-10:
[QUALIFY clause](https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-syntax-qry-select-qualify).

## The Platform

`platform.yaml` holds what belongs to your workspace. Everything specific to
Databricks is under `databricks:`.

- `workspace: host` reads each environment's URL from `project.yaml`.
- `run_as` runs the pipeline and the job as a service principal. Databricks
  calls this the most secure way to run production work.
- `permissions` lets one group manage the pipeline and job and another view
  them. The two groups are `engineers` and `analysts` in `project.yaml`, so
  `ingestron init --set engineers=<group>` sets one without the other.
- `dev` deploys in development mode: names carry your user name and the
  schedule is paused. `prod` deploys in production mode.

Sources, accessed 2026-11-10:
[Specify a run identity](https://docs.databricks.com/aws/en/dev-tools/bundles/run-as),
[Set permissions for resources in bundles](https://docs.databricks.com/aws/en/dev-tools/bundles/permissions)
and [Deployment modes](https://docs.databricks.com/aws/en/dev-tools/bundles/deployment-modes).

## Make it yours

This folder is your project now. Change it as you like and keep it in Git.

- Change the contracts to match your files, and `object` in each flow to the
  folder under the volume.
- Change `catalog` in `standard.yaml` to your catalogs' names.
- Run `ingestron plan` after each change. It lists what Ingestron would write
  and reports anything the pack cannot apply.
