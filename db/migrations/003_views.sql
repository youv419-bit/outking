-- Page views alongside unique visitors.
--
-- `visitors` counts distinct browsers, which is the honest measure of reach but
-- barely moves early on: the same three people reloading a hundred times stays
-- at three. Views count actual page loads, so the badge reflects traffic.
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS views bigint NOT NULL DEFAULT 1;
