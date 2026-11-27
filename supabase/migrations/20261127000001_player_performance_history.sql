-- Player performance history: one row per player per nightly cron run
-- Stores the performance delta, demand delta, match data, and price movement

CREATE TABLE IF NOT EXISTS player_performance_history (
  id                    uuid            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id             uuid            NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  recorded_at           timestamptz     NOT NULL DEFAULT now(),
  price_before          numeric         NOT NULL,
  price_after           numeric         NOT NULL,
  performance_delta_pct numeric         NOT NULL,
  demand_delta_pct      numeric,
  raw_points            numeric         NOT NULL,
  competition_weight    numeric         NOT NULL,
  match_data            jsonb
);

CREATE INDEX IF NOT EXISTS player_performance_history_player_recorded_idx
  ON player_performance_history (player_id, recorded_at DESC);

ALTER TABLE player_performance_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read performance history"
  ON player_performance_history
  FOR SELECT
  TO authenticated
  USING (true);

-- RPC: fetch recent performance history for a player
CREATE OR REPLACE FUNCTION get_player_performance_history(
  p_player_id uuid,
  p_limit     int DEFAULT 30
)
RETURNS SETOF player_performance_history
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT *
  FROM player_performance_history
  WHERE player_id = p_player_id
  ORDER BY recorded_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_player_performance_history(uuid, int) TO authenticated;
