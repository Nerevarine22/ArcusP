-- Only requested wallets are retained. Public builder archives are not copied into Postgres.
CREATE SCHEMA IF NOT EXISTS entropy_analytics;
REVOKE ALL ON SCHEMA entropy_analytics FROM PUBLIC;
CREATE TABLE IF NOT EXISTS entropy_analytics.wallet_days (
  address text NOT NULL CHECK (address ~ '^0x[0-9a-f]{40}$'),
  day date NOT NULL,
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object' AND document->>'day' = day::text),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (address, day)
);
CREATE TABLE IF NOT EXISTS entropy_analytics.wallet_reports (
  address text NOT NULL CHECK (address ~ '^0x[0-9a-f]{40}$'),
  period text NOT NULL CHECK (period IN ('ALL','24H','7D','30D','90D')),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object' AND document->>'address' = address AND document->>'version' = '2'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (address, period)
);
REVOKE ALL ON ALL TABLES IN SCHEMA entropy_analytics FROM PUBLIC;
