-- Visitor presence and outbound click tracking.

-- One row per browser (identified by an opaque cookie, never an IP).
CREATE TABLE IF NOT EXISTS visitors (
  visitor_id text PRIMARY KEY,
  first_seen  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visitors_last_seen_idx ON visitors (last_seen DESC);

-- One row per outbound click on an owner's website link.
CREATE TABLE IF NOT EXISTS link_clicks (
  id            bigserial PRIMARY KEY,
  position_slug text NOT NULL REFERENCES positions(slug) ON DELETE CASCADE,
  company_id    uuid REFERENCES companies(id) ON DELETE SET NULL,
  visitor_id    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS link_clicks_position_idx ON link_clicks (position_slug);
CREATE INDEX IF NOT EXISTS link_clicks_company_idx  ON link_clicks (company_id);
-- One click per visitor per position per hour keeps refresh-spam out of the count.
-- `created_at AT TIME ZONE 'UTC'` is required: date_trunc() on a timestamptz
-- depends on the session TimeZone and is only STABLE, which Postgres refuses
-- to index. Pinning the zone makes the whole expression IMMUTABLE.
CREATE UNIQUE INDEX IF NOT EXISTS link_clicks_dedupe_idx
  ON link_clicks (
    position_slug,
    visitor_id,
    (date_trunc('hour', created_at AT TIME ZONE 'UTC'))
  )
  WHERE visitor_id IS NOT NULL;
