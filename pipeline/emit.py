"""Prompt emission: stdout display + append to runs/<video_id>/events.jsonl."""

import dataclasses
import json
import os
import time
from pathlib import Path

from .chat_types import Prompt

_RUNS_DIR = Path(__file__).parent / "runs"


def emit(prompt: Prompt) -> None:
    """Print prompt to stdout and log to runs/<video_id>/events.jsonl."""
    _print_prompt(prompt)
    _log_prompt(prompt)


def _print_prompt(prompt: Prompt) -> None:
    mins = int(prompt.stream_time_s) // 60
    secs = int(prompt.stream_time_s) % 60
    time_str = f"{mins:02d}:{secs:02d}"
    print(f"[{time_str}] [{prompt.source.value}] [{prompt.category.value}] {prompt.text}")


def _log_prompt(prompt: Prompt) -> None:
    run_dir = _RUNS_DIR / prompt.video_id
    run_dir.mkdir(parents=True, exist_ok=True)
    event_file = run_dir / "events.jsonl"

    record = dataclasses.asdict(prompt)
    record["source"] = prompt.source.value
    record["category"] = prompt.category.value
    record["logged_at"] = time.time()

    with open(event_file, "a") as f:
        f.write(json.dumps(record) + "\n")
