"""
Spike 3 — Chat Dataset Collector

Downloads the full chat replay for a completed YouTube livestream using pytchat.
Each run saves one JSONL file and upserts an entry into dataset/manifest.json.

Usage:
    pip install -r requirements.txt
    python collect.py <VIDEO_ID> [--category <cat>] [--notes <text>] [--force]

Categories: commentary, talk, reaction, gaming, watchalong, other
"""

import argparse
import fcntl
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import pytchat
except ImportError:
    print("pytchat not installed. Run: pip install -r requirements.txt")
    sys.exit(1)

try:
    import requests
except ImportError:
    print("requests not installed. Run: pip install -r requirements.txt")
    sys.exit(1)

HERE = Path(__file__).parent
DATASET_DIR = HERE / "dataset"
RAW_DIR = DATASET_DIR / "raw"
MANIFEST_FILE = DATASET_DIR / "manifest.json"
MANIFEST_LOCK_FILE = DATASET_DIR / "manifest.lock"

VALID_CATEGORIES = {"commentary", "talk", "reaction", "gaming", "watchalong", "other"}


def fetch_video_metadata(video_id: str) -> dict:
    url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        return {"title": data.get("title", "Unknown"), "channel": data.get("author_name", "Unknown")}
    except Exception as e:
        print(f"[warn] could not fetch metadata: {e}")
        return {"title": "Unknown", "channel": "Unknown"}


def load_manifest() -> dict:
    if MANIFEST_FILE.exists():
        with open(MANIFEST_FILE) as f:
            return json.load(f)
    return {"version": 1, "streams": []}


def save_manifest(manifest: dict) -> None:
    MANIFEST_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(MANIFEST_FILE, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"Manifest updated: {MANIFEST_FILE}")


def upsert_manifest(manifest: dict, entry: dict) -> None:
    streams = manifest["streams"]
    for i, s in enumerate(streams):
        if s["video_id"] == entry["video_id"]:
            streams[i] = entry
            return
    streams.append(entry)


def locked_update_manifest(entry: dict) -> None:
    """Re-read, upsert, and write the manifest under an exclusive file lock."""
    DATASET_DIR.mkdir(parents=True, exist_ok=True)
    with open(MANIFEST_LOCK_FILE, "w") as lock_f:
        fcntl.flock(lock_f, fcntl.LOCK_EX)
        manifest = load_manifest()
        upsert_manifest(manifest, entry)
        save_manifest(manifest)


def collect(video_id: str, category: str, notes: str, force: bool) -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest()

    existing = next((s for s in manifest["streams"] if s["video_id"] == video_id), None)
    if existing and not force:
        print(f"Already collected {video_id} ({existing['message_count']} messages). Use --force to re-collect.")
        return

    print(f"Fetching metadata for {video_id}...")
    meta = fetch_video_metadata(video_id)
    print(f"  Title:   {meta['title']}")
    print(f"  Channel: {meta['channel']}")

    out_file = RAW_DIR / f"{video_id}.jsonl"
    print(f"Connecting to chat replay via pytchat...")

    try:
        chat = pytchat.create(video_id=video_id)
    except Exception as e:
        print(f"Failed to connect: {e}")
        sys.exit(1)

    print(f"Collecting messages → {out_file}")

    message_count = 0
    min_ts_ms: float | None = None
    max_ts_ms: float | None = None

    with open(out_file, "w") as f:
        while chat.is_alive():
            try:
                for item in chat.get().sync_items():
                    try:
                        ts_ms = float(item.timestamp)
                        ts_iso = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).isoformat()
                    except Exception:
                        ts_ms = time.time() * 1000
                        ts_iso = datetime.now(tz=timezone.utc).isoformat()

                    if min_ts_ms is None or ts_ms < min_ts_ms:
                        min_ts_ms = ts_ms
                    if max_ts_ms is None or ts_ms > max_ts_ms:
                        max_ts_ms = ts_ms

                    amount = getattr(item, "amountString", None) or None

                    entry = {
                        "video_id": video_id,
                        "message_id": item.id,
                        "timestamp_ms": ts_ms,
                        "timestamp_iso": ts_iso,
                        "author": item.author.name if hasattr(item, "author") else None,
                        "author_id": item.author.channelId if hasattr(item, "author") else None,
                        "text": item.message,
                        "is_member": bool(getattr(item.author, "isChatMember", False)) if hasattr(item, "author") else False,
                        "is_moderator": bool(getattr(item.author, "isChatModerator", False)) if hasattr(item, "author") else False,
                        "type": item.type if hasattr(item, "type") else "textMessage",
                        "amount": amount,
                    }
                    f.write(json.dumps(entry) + "\n")
                    message_count += 1

                    if message_count % 500 == 0:
                        print(f"\n  {message_count} messages collected...")
                    elif message_count % 10 == 0:
                        print(".", end="", flush=True)

            except Exception as e:
                print(f"[warn] error reading batch: {e}")
                time.sleep(1)

            time.sleep(0.2)

    chat_duration_seconds = 0
    if min_ts_ms is not None and max_ts_ms is not None:
        chat_duration_seconds = int((max_ts_ms - min_ts_ms) / 1000)

    print(f"\n=== DONE ===")
    print(f"Messages:         {message_count}")
    print(f"Chat duration:    {chat_duration_seconds // 60}m {chat_duration_seconds % 60}s")
    print(f"Raw file:         {out_file}")

    manifest_entry = {
        "video_id": video_id,
        "url": f"https://youtube.com/watch?v={video_id}",
        "title": meta["title"],
        "channel": meta["channel"],
        "category": category,
        "notes": notes,
        "collected_at": datetime.now(tz=timezone.utc).isoformat(),
        "message_count": message_count,
        "chat_duration_seconds": chat_duration_seconds,
        "raw_file": str(out_file.relative_to(HERE)),
    }

    locked_update_manifest(manifest_entry)


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect YouTube live chat replay for a completed stream.")
    parser.add_argument("video_id", help="YouTube video ID (e.g. dQw4w9WgXcQ)")
    parser.add_argument(
        "--category",
        choices=sorted(VALID_CATEGORIES),
        default="other",
        help="Content category (default: other)",
    )
    parser.add_argument("--notes", default="", help="Free-text annotation stored in manifest")
    parser.add_argument("--force", action="store_true", help="Re-collect even if already in manifest")
    args = parser.parse_args()

    collect(args.video_id, args.category, args.notes, args.force)


if __name__ == "__main__":
    main()
