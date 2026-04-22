"""
Spike 1 — Unofficial path latency measurement (pytchat)

Connects to a YouTube live chat via pytchat (uses YouTube innertube, not Data API)
and logs (text, publishedAt, receivedAt, latencyMs) for every message.

Usage:
    pip install -r requirements.txt
    python spikes/spike_01_ingest/measure_unofficial.py <VIDEO_ID> [DURATION_MINUTES]

Run simultaneously with measure_api.ts against the same VIDEO_ID to compare paths.
Results are appended to results_unofficial.jsonl in the same directory.
"""

import json
import sys
import time
import os
from datetime import datetime, timezone
from pathlib import Path

try:
    import pytchat
except ImportError:
    print("pytchat not installed. Run: pip install pytchat")
    sys.exit(1)

VIDEO_ID = sys.argv[1] if len(sys.argv) > 1 else None
DURATION_MINUTES = int(sys.argv[2]) if len(sys.argv) > 2 else 10

if not VIDEO_ID:
    print("Usage: measure_unofficial.py <VIDEO_ID> [DURATION_MINUTES]")
    sys.exit(1)

OUT_FILE = Path(__file__).parent / "results_unofficial.jsonl"

def main():
    print(f"[measure_unofficial] video={VIDEO_ID} duration={DURATION_MINUTES}min")
    print(f"[measure_unofficial] connecting via pytchat...")

    try:
        chat = pytchat.create(video_id=VIDEO_ID)
    except Exception as e:
        print(f"[measure_unofficial] failed to connect: {e}")
        sys.exit(1)

    print(f"[measure_unofficial] connected. Writing to {OUT_FILE}")

    start_time = time.time()
    end_time = start_time + DURATION_MINUTES * 60

    message_count = 0
    latencies = []
    reconnect_count = 0

    with open(OUT_FILE, "a") as out:
        while time.time() < end_time:
            if not chat.is_alive():
                reconnect_count += 1
                print(f"[measure_unofficial] chat ended or disconnected (reconnect #{reconnect_count})")
                # pytchat doesn't support reconnection; log and break
                break

            try:
                for item in chat.get().sync_items():
                    received_at_ms = time.time() * 1000

                    # pytchat exposes datetime as a string; parse to epoch ms
                    try:
                        published_at_str = str(item.datetime)
                        # pytchat datetime format: "2024-01-01 12:00:00"
                        published_dt = datetime.strptime(published_at_str, "%Y-%m-%d %H:%M:%S")
                        published_dt = published_dt.replace(tzinfo=timezone.utc)
                        published_at_ms = published_dt.timestamp() * 1000
                    except Exception:
                        published_at_ms = received_at_ms
                        published_at_str = datetime.utcnow().isoformat()

                    latency_ms = received_at_ms - published_at_ms
                    latencies.append(latency_ms)
                    message_count += 1

                    entry = {
                        "messageId": item.id,
                        "text": item.message,
                        "publishedAt": published_at_str,
                        "receivedAt": received_at_ms,
                        "latencyMs": latency_ms,
                        "author": item.author.name if hasattr(item, "author") else None,
                    }
                    out.write(json.dumps(entry) + "\n")

                    if message_count % 20 == 0:
                        print(
                            f"[measure_unofficial] msgs={message_count} "
                            f"last_latency={round(latency_ms)}ms"
                        )

            except Exception as e:
                print(f"[measure_unofficial] error reading batch: {e}")
                time.sleep(2)

            time.sleep(0.5)  # pytchat buffers internally; poll at 0.5s

    # Summary
    if latencies:
        latencies.sort()
        p50 = percentile(latencies, 50)
        p95 = percentile(latencies, 95)
        p99 = percentile(latencies, 99)
    else:
        p50 = p95 = p99 = 0

    print("\n=== SUMMARY ===")
    print(f"Messages received:  {message_count}")
    print(f"Reconnects:         {reconnect_count}")
    print(f"Latency p50:        {round(p50)}ms")
    print(f"Latency p95:        {round(p95)}ms")
    print(f"Latency p99:        {round(p99)}ms")
    print(f"Results written to: {OUT_FILE}")

def percentile(sorted_list, p):
    if not sorted_list:
        return 0
    idx = max(0, int((p / 100) * len(sorted_list)) - 1)
    return sorted_list[idx]

if __name__ == "__main__":
    main()
