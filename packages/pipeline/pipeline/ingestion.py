import glob as glob_module
import json
from typing import Iterator

from .chat_types import ChatMessage


def load_corpus(path_glob: str) -> list[ChatMessage]:
    """Load all JSONL files matching path_glob into a deduplicated, time-sorted list."""
    paths = sorted(glob_module.glob(path_glob))
    if not paths:
        raise FileNotFoundError(f"No files matched glob: {path_glob}")

    messages: list[ChatMessage] = []
    seen_ids: set[str] = set()

    for path in paths:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    d = json.loads(line)
                except json.JSONDecodeError:
                    continue

                msg_id = d.get("message_id", "")
                if not msg_id or msg_id in seen_ids:
                    continue
                seen_ids.add(msg_id)

                messages.append(ChatMessage(
                    video_id=d.get("video_id", ""),
                    message_id=msg_id,
                    timestamp_ms=float(d.get("timestamp_ms", 0)),
                    timestamp_iso=d.get("timestamp_iso", ""),
                    author=d.get("author"),
                    author_id=d.get("author_id"),
                    text=d.get("text", ""),
                    is_member=bool(d.get("is_member", False)),
                    is_moderator=bool(d.get("is_moderator", False)),
                    type=d.get("type", "textMessage"),
                    amount=d.get("amount"),
                ))

    messages.sort(key=lambda m: m.timestamp_ms)
    return messages


def load_single(video_id: str, dataset_dir: str = "dataset/raw") -> list[ChatMessage]:
    return load_corpus(f"{dataset_dir}/{video_id}.jsonl")


def group_by_video(messages: list[ChatMessage]) -> dict[str, list[ChatMessage]]:
    groups: dict[str, list[ChatMessage]] = {}
    for msg in messages:
        groups.setdefault(msg.video_id, []).append(msg)
    return groups


def iter_at_pace(messages: list[ChatMessage]) -> Iterator[tuple[float, ChatMessage]]:
    """Yield (sleep_seconds, message) pairs preserving original stream timing."""
    if not messages:
        return
    prev_ts = messages[0].timestamp_ms
    for msg in messages:
        sleep_s = max(0.0, (msg.timestamp_ms - prev_ts) / 1000.0)
        yield sleep_s, msg
        prev_ts = msg.timestamp_ms
