"""Shared utilities for ML training and prediction scripts."""

import os
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(os.environ.get("DOTENV_FILE", ".env.local"))

# fmt: off
# Replicates the direct-address heuristic from lib/scoring.ts:
#   text.includes("?") || /^@\w/.test(text)
FAN_FEATURES_SQL = """
SELECT
    f.id                                                                          AS fan_id,
    f.owner_user_id,
    COUNT(DISTINCT m.yt_video_id)                                                 AS streams_attended,
    COUNT(m.id)                                                                   AS total_messages,
    MIN(m.time)                                                                   AS earliest_message_time,
    MAX(m.time)                                                                   AS latest_message_time,
    COUNT(CASE WHEN m.text IS NOT NULL
               AND (m.text LIKE '%%?%%' OR m.text ~ '^@[A-Za-z0-9_]')
               THEN 1 END)                                                        AS direct_address_count,
    BOOL_OR(m.paid_event_type IS NOT NULL)                                        AS has_paid_event
FROM public.fans f
LEFT JOIN public.messages m ON f.id = m.fan_id
GROUP BY f.id, f.owner_user_id
HAVING COUNT(m.id) > 0
"""
# fmt: on

FEATURE_COLS = [
    "streams_attended",
    "total_messages",
    "messages_per_stream",
    "days_since_last_message",
    "weeks_since_first_message",
    "direct_address_count",
    "direct_address_rate",
]


def get_db_connection():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL not set. Add it to .env.local.\n"
            "Format: postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
        )
    return psycopg2.connect(url)


def fetch_fan_rows(conn) -> list[dict]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(FAN_FEATURES_SQL)
        return [dict(r) for r in cur.fetchall()]


def build_features(rows: list[dict], now: datetime) -> list[dict]:
    """Convert raw DB rows into feature dicts. `now` should be timezone-aware UTC."""
    result = []
    for row in rows:
        streams = row["streams_attended"] or 0
        total_msgs = row["total_messages"] or 0
        msgs_per_stream = total_msgs / streams if streams > 0 else 0.0

        latest = row["latest_message_time"]
        earliest = row["earliest_message_time"]

        if latest.tzinfo is None:
            latest = latest.replace(tzinfo=timezone.utc)
        if earliest.tzinfo is None:
            earliest = earliest.replace(tzinfo=timezone.utc)

        days_since_last = (now - latest).total_seconds() / 86_400
        weeks_since_first = (now - earliest).total_seconds() / (86_400 * 7)
        direct_count = row["direct_address_count"] or 0
        direct_rate = direct_count / total_msgs if total_msgs > 0 else 0.0

        result.append(
            {
                "fan_id": str(row["fan_id"]),
                "owner_user_id": str(row["owner_user_id"]),
                "has_paid_event": int(row.get("has_paid_event") or False),
                "streams_attended": streams,
                "total_messages": total_msgs,
                "messages_per_stream": round(msgs_per_stream, 4),
                "days_since_last_message": round(days_since_last, 2),
                "weeks_since_first_message": round(weeks_since_first, 4),
                "direct_address_count": direct_count,
                "direct_address_rate": round(direct_rate, 6),
            }
        )
    return result
