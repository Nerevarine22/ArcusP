-- Run once per database with npm run research:init. No wallet is stored without explicit consent.
CREATE SCHEMA IF NOT EXISTS analytics_research;
REVOKE ALL ON SCHEMA analytics_research FROM PUBLIC;
CREATE TABLE IF NOT EXISTS analytics_research.wallets (
  project text NOT NULL CHECK (project IN ('arcus', 'txflow')),
  address text NOT NULL CHECK (address ~ '^0x[0-9a-f]{40}$'),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'
    AND document->>'address' = address AND document->>'project' = project
    AND document->>'schemaVersion' = '1'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project, address)
);
REVOKE ALL ON analytics_research.wallets FROM PUBLIC;

-- One row per wallet and epoch for SQL research. Decimal amounts remain exact numeric values.
CREATE OR REPLACE VIEW analytics_research.periods AS
SELECT w.project, w.address, w.document->'profile'->>'name' AS arcus_name,
  p.key AS period_id, p.value->>'season' AS season,
  (p.value->>'start')::timestamptz AS period_start,
  (p.value->>'end')::timestamptz AS period_end,
  (p.value->'points'->>'value')::numeric AS points,
  p.value->'points'->>'source' AS points_source,
  (p.value->'summary'->>'volumeUsd')::numeric AS volume_usd,
  (p.value->'summary'->>'netFeesUsd')::numeric AS net_fees_usd,
  (p.value->>'eligibleForPointsComparison')::boolean AS comparable,
  (p.value->>'eligibleForHoldingComparison')::boolean AS holding_comparable,
  p.value AS analysis
FROM analytics_research.wallets w
CROSS JOIN LATERAL jsonb_each(w.document->'periods') p;
REVOKE ALL ON analytics_research.periods FROM PUBLIC;
