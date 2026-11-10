-- bronze.customers keeps every export, so a customer can appear more than once:
-- take each customer's latest row, so their orders count once.
WITH customers AS (
  SELECT id, email
  FROM {{ tables.customers }}
  QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY updated_at DESC) = 1
)
SELECT
  c.email,
  DATE(o.ordered_at) AS day,
  SUM(o.total) AS total
FROM {{ tables.orders }} AS o
JOIN customers AS c ON c.id = o.customer_id
GROUP BY c.email, DATE(o.ordered_at)
