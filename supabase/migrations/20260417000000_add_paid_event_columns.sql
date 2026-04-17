ALTER TABLE messages
  ADD COLUMN paid_event_type TEXT,
  ADD COLUMN paid_amount_micros BIGINT,
  ADD COLUMN paid_currency TEXT;

-- Fast lookup of all paid events for a given owner (used by scoring)
CREATE INDEX messages_paid_event_idx
  ON messages (owner_user_id, paid_event_type)
  WHERE paid_event_type IS NOT NULL;
