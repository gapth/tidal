-- Add score_type discriminator to fan_scores
ALTER TABLE fan_scores ADD COLUMN score_type text NOT NULL DEFAULT 'nudge';

-- Replace unique constraint to include score_type
ALTER TABLE fan_scores DROP CONSTRAINT fan_scores_owner_fan_unique;
ALTER TABLE fan_scores ADD CONSTRAINT fan_scores_owner_fan_type_unique
  UNIQUE (owner_user_id, fan_id, score_type);

-- Replace index to support per-type ranking
DROP INDEX fan_scores_owner_score_idx;
CREATE INDEX fan_scores_owner_type_score_idx
  ON fan_scores (owner_user_id, score_type, score DESC);
