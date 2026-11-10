-- bronze.customers keeps every export, so a customer can appear more than once:
-- take each customer's latest row, so their orders count once. Rows with the same
-- updated_at are ordered by when they were read, then by file and email, so every
-- run picks the same row.
WITH customers AS (
  SELECT id, email
  FROM {{ tables.customers }}
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
