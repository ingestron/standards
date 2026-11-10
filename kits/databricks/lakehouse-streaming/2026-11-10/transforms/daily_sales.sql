-- bronze.customers keeps every export as it arrived, so a customer can appear more
-- than once, and a row can lack an id or an email: gold cleanses and filters the
-- rows it reads, as silver would, then takes each customer's latest row, so their
-- orders count once. Rows with the same updated_at are ordered by when they were
-- read, then by file and email, so every run picks the same row.
WITH exported AS (
  SELECT id, nullif(trim(email), '') AS email, updated_at, _loaded_at, _source_file
  FROM {{ tables.customers }}
),
customers AS (
  SELECT id, email
  FROM exported
  WHERE id IS NOT NULL AND email IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY id
    ORDER BY updated_at DESC, _loaded_at DESC, _source_file DESC, email
  ) = 1
)
SELECT
  c.email,
  DATE(o.ordered_at) AS day,
  SUM(o.total) AS total
FROM {{ tables.orders }} AS o
JOIN customers AS c ON c.id = o.customer_id
GROUP BY c.email, DATE(o.ordered_at)
