"""
Run batch inference and upsert spend probabilities to fan_predictions table.

Usage:
    python scripts/predict_scores.py

Requires DATABASE_URL in .env.local and a trained model at models/spend_model.pkl.
"""

from datetime import datetime, timezone

import joblib
import pandas as pd
import psycopg2.extras

from ml_utils import FEATURE_COLS, build_features, fetch_fan_rows, get_db_connection

MODEL_PATH = "models/spend_model.pkl"

UPSERT_SQL = """
INSERT INTO public.fan_predictions (fan_id, owner_user_id, spend_prob, model_version, computed_at)
VALUES %s
ON CONFLICT (owner_user_id, fan_id)
DO UPDATE SET
    spend_prob    = EXCLUDED.spend_prob,
    model_version = EXCLUDED.model_version,
    computed_at   = EXCLUDED.computed_at
"""


def main():
    artifact = joblib.load(MODEL_PATH)
    model = artifact["model"]
    features = artifact["features"]
    version = artifact["version"]
    print(f"Loaded model {version} from {MODEL_PATH}")

    conn = get_db_connection()
    rows = fetch_fan_rows(conn)
    if not rows:
        print("No fans found in database.")
        conn.close()
        return

    now = datetime.now(timezone.utc)
    fan_rows = build_features(rows, now)

    X = pd.DataFrame(fan_rows)[features]
    probs = model.predict_proba(X)[:, 1]

    computed_at = now.isoformat()
    upsert_values = [
        (r["fan_id"], r["owner_user_id"], float(prob), version, computed_at)
        for r, prob in zip(fan_rows, probs)
    ]

    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, UPSERT_SQL, upsert_values)
    conn.commit()
    conn.close()

    print(f"Upserted {len(upsert_values)} predictions → fan_predictions")
    all_probs = [p for _, _, p, _, _ in upsert_values]
    print(f"  prob range : {min(all_probs):.3f} – {max(all_probs):.3f}")
    above_half = sum(1 for p in all_probs if p > 0.5)
    print(f"  prob > 0.5 : {above_half} fans")


if __name__ == "__main__":
    main()
