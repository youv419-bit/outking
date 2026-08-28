-- ChessBid — initial schema
-- Deliberately small: 7 tables, no ORM, no soft-delete graveyards.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── users ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle       text NOT NULL,
  handle_lower text GENERATED ALWAYS AS (lower(handle)) STORED,
  email        text NOT NULL,
  email_lower  text GENERATED ALWAYS AS (lower(email)) STORED,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_handle_key ON users (handle_lower);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key  ON users (email_lower);

-- ── companies ───────────────────────────────────────────────
-- One row per brand submission. A user may submit several over time;
-- the position points at the exact company row that won it.
CREATE TABLE IF NOT EXISTS companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  tagline     text NOT NULL CHECK (char_length(tagline) BETWEEN 1 AND 90),
  website_url text NOT NULL CHECK (website_url ~* '^https?://'),
  x_username  text,
  logo_mime   text,
  logo_data   bytea,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS companies_user_idx ON companies (user_id);

-- ── positions ───────────────────────────────────────────────
-- Fixed supply. Seeded once by scripts/seed.mjs, never created at runtime.
CREATE TABLE IF NOT EXISTS positions (
  slug               text PRIMARY KEY,
  piece_type         text NOT NULL CHECK (piece_type IN ('king','queen','rook','bishop','knight','pawn')),
  label              text NOT NULL,
  square             text NOT NULL,
  sort_order         int  NOT NULL,
  starting_bid_cents int  NOT NULL CHECK (starting_bid_cents > 0),
  current_bid_cents  int,
  owner_user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  owner_company_id   uuid REFERENCES companies(id) ON DELETE SET NULL,
  ownership_changes  int  NOT NULL DEFAULT 0,
  owned_since        timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS positions_sort_idx ON positions (sort_order);

-- ── ownership (history) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS ownership (
  id            bigserial PRIMARY KEY,
  position_slug text NOT NULL REFERENCES positions(slug) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bid_cents     int  NOT NULL,
  acquired_at   timestamptz NOT NULL DEFAULT now(),
  released_at   timestamptz
);
CREATE INDEX IF NOT EXISTS ownership_position_idx ON ownership (position_slug, acquired_at DESC);
CREATE INDEX IF NOT EXISTS ownership_recent_idx   ON ownership (acquired_at DESC);

-- ── bids ────────────────────────────────────────────────────
-- A bid is created *pending* before checkout and only settles from a webhook.
CREATE TABLE IF NOT EXISTS bids (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_slug       text NOT NULL REFERENCES positions(slug) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  amount_cents        int  NOT NULL CHECK (amount_cents > 0),
  currency            text NOT NULL DEFAULT 'USD',
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','paid','failed','superseded','refund_required')),
  checkout_session_id text,
  settled_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bids_position_idx ON bids (position_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS bids_session_idx  ON bids (checkout_session_id);

-- ── transactions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id              uuid REFERENCES bids(id) ON DELETE SET NULL,
  provider            text NOT NULL DEFAULT 'dodo',
  provider_payment_id text NOT NULL,
  amount_cents        int  NOT NULL,
  currency            text NOT NULL,
  status              text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
-- Idempotency guard #1: one settled transaction per provider payment.
CREATE UNIQUE INDEX IF NOT EXISTS transactions_provider_payment_key
  ON transactions (provider, provider_payment_id);

-- ── payment_events (raw webhook log) ────────────────────────
CREATE TABLE IF NOT EXISTS payment_events (
  webhook_id   text PRIMARY KEY,
  type         text NOT NULL,
  payload      jsonb NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS payment_events_type_idx ON payment_events (type, received_at DESC);
