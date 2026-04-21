"""
Export fan-level features + label to ml/training_data.csv.

Usage:
    python scripts/export_training_data.py

Requires DATABASE_URL in .env.local.
"""

import csv
import os
from datetime import datetime, timezone

from ml_utils import FEATURE_COLS, build_features, fetch_fan_rows, get_db_connection

OUTPUT_PATH = "ml/training_data.csv"
COLUMNS = ["fan_id", "owner_user_id", "has_paid_event"] + FEATURE_COLS


def main():
    conn = get_db_connection()
    rows = fetch_fan_rows(conn)
    conn.close()

    now = datetime.now(timezone.utc)
    fan_rows = build_features(rows, now)

    os.makedirs("ml", exist_ok=True)
    with open(OUTPUT_PATH, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(fan_rows)

    positives = sum(r["has_paid_event"] for r in fan_rows)
    total = len(fan_rows)
    print(f"Exported {total} fans → {OUTPUT_PATH}")
    print(f"  has_paid_event=1 : {positives} ({100 * positives / total:.1f}%)")
    print(f"  has_paid_event=0 : {total - positives} ({100 * (total - positives) / total:.1f}%)")


if __name__ == "__main__":
    main()
