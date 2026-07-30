-- Prediction Snapshots Table
-- Records option percentages over time for Polymarket-style charts
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS prediction_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prediction_id UUID NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES prediction_options(id) ON DELETE CASCADE,
  coins_on_option INTEGER DEFAULT 0,
  percentage NUMERIC(5,2) DEFAULT 0,
  total_pool INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast time-series queries
CREATE INDEX IF NOT EXISTS idx_snapshots_prediction_time 
  ON prediction_snapshots(prediction_id, created_at);

-- Auto-cleanup: keep only last 30 days of snapshots
-- (Optional: set up a cron job or edge function to delete old data)

COMMENT ON TABLE prediction_snapshots IS 'Time-series snapshots of option percentages for chart visualization';
