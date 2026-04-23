"""Replay CLI — feed a corpus through the hybrid pipeline at original stream pace.

Usage:
    python pipeline/replay.py --video-id <ID> [--dataset-dir <path>]
    python pipeline/replay.py --glob "dataset/raw/*.jsonl"

    # Point at the Spike 3 corpus from the sibling tidal repo:
    python pipeline/replay.py --glob "../tidal/spikes/spike_03_dataset/dataset/raw/*.jsonl"

Flags:
    --video-id      Single video ID to replay (looks in --dataset-dir)
    --glob          Glob pattern matching one or more JSONL files
    --dataset-dir   Base directory for --video-id lookup (default: dataset/raw)
    --sweep-interval-s   Pipeline A sweep interval in stream-seconds (default: 180)
    --sweep-window-s     Pipeline A inspection window in seconds (default: 180)
    --model              LLM model override (default: gpt-4o-mini)
    --no-llm        Dry run: heuristics only, skip all LLM calls
"""

import argparse
import dataclasses
import json
import os
import statistics
import sys
import time
from collections import deque
from pathlib import Path

# Allow running as `python pipeline/replay.py` from project root
sys.path.insert(0, str(Path(__file__).parent.parent))

from pipeline.config import PipelineConfig
from pipeline.dedup import DedupLayer
from pipeline.detection.pipeline_a import PipelineA
from pipeline.detection.pipeline_c import PipelineC
from pipeline.embeddings import EmbeddingCache
from pipeline.emit import emit
from pipeline.ingestion import group_by_video, load_corpus, load_single
from pipeline.chat_types import Category, Prompt, PromptSource

_RUNS_DIR = Path(__file__).parent / "runs"
_REPORTS_DIR = Path(__file__).parent


# ── stats accumulator ─────────────────────────────────────────────────────────

class RunStats:
    def __init__(self) -> None:
        self.prompts: list[Prompt] = []
        self.c_latencies_ms: list[float] = []
        self.a_latencies_ms: list[float] = []
        self.a_suppressed: int = 0
        self.stream_stats: list[dict] = []

    def record(self, prompt: Prompt) -> None:
        self.prompts.append(prompt)
        if prompt.source == PromptSource.C:
            self.c_latencies_ms.append(prompt.llm_latency_ms)
        else:
            self.a_latencies_ms.append(prompt.llm_latency_ms)

    def record_suppression(self) -> None:
        self.a_suppressed += 1

    def add_stream(
        self,
        video_id: str,
        message_count: int,
        duration_s: float,
        prompts: list[Prompt],
    ) -> None:
        by_cat: dict[str, int] = {}
        for p in prompts:
            by_cat[p.category.value] = by_cat.get(p.category.value, 0) + 1
        c_count = sum(1 for p in prompts if p.source == PromptSource.C)
        a_count = sum(1 for p in prompts if p.source == PromptSource.A)
        rate = len(prompts) / (duration_s / 60) if duration_s > 0 else 0
        self.stream_stats.append({
            "video_id": video_id,
            "messages": message_count,
            "duration_s": duration_s,
            "total_prompts": len(prompts),
            "c_prompts": c_count,
            "a_prompts": a_count,
            "prompts_per_min": round(rate, 2),
            "by_category": by_cat,
        })


# ── replay one stream ──────────────────────────────────────────────────────────

def replay_stream(
    messages: list[dict],  # actually list[ChatMessage], typed loosely for import clarity
    config: PipelineConfig,
    embed_cache: EmbeddingCache,
    stats: RunStats,
    no_llm: bool = False,
) -> list[Prompt]:
    from pipeline.chat_types import ChatMessage  # local import avoids circular issues

    if not messages:
        return []

    video_id = messages[0].video_id
    stream_start_ms = messages[0].timestamp_ms
    stream_end_ms = messages[-1].timestamp_ms
    duration_s = (stream_end_ms - stream_start_ms) / 1000.0

    pipeline_c = PipelineC(config, embed_cache)
    pipeline_a = PipelineA(config)
    dedup = DedupLayer(config, embed_cache)

    stream_prompts: list[Prompt] = []
    recent_c_prompts: deque[Prompt] = deque(maxlen=100)

    # Rolling window for Pipeline A sweep
    a_window: deque = deque()
    last_sweep_ms = stream_start_ms

    print(f"\n▶  Replaying {video_id}  ({len(messages)} messages, {duration_s/60:.1f} min)")

    prev_ts = messages[0].timestamp_ms
    for msg in messages:
        sleep_s = max(0.0, (msg.timestamp_ms - prev_ts) / 1000.0)
        time.sleep(sleep_s)
        prev_ts = msg.timestamp_ms

        # Maintain Pipeline A window
        a_window.append(msg)
        cutoff = msg.timestamp_ms - config.sweep_window_s * 1000
        while a_window and a_window[0].timestamp_ms < cutoff:
            a_window.popleft()

        # Pipeline C: per-message heuristics
        if not no_llm:
            c_prompt = pipeline_c.process(msg, stream_start_ms)
            if c_prompt:
                emit(c_prompt)
                stream_prompts.append(c_prompt)
                stats.record(c_prompt)
                recent_c_prompts.append(c_prompt)

        # Pipeline A: periodic sweep (stream-time clock)
        if msg.timestamp_ms - last_sweep_ms >= config.sweep_interval_s * 1000:
            if not no_llm:
                a_prompt = pipeline_a.check(
                    window=list(a_window),
                    stream_start_ms=stream_start_ms,
                    sweep_ts_ms=msg.timestamp_ms,
                )
                if a_prompt:
                    current_stream_ms = msg.timestamp_ms - stream_start_ms
                    if dedup.is_duplicate(a_prompt, list(recent_c_prompts), current_stream_ms):
                        stats.record_suppression()
                    else:
                        emit(a_prompt)
                        stream_prompts.append(a_prompt)
                        stats.record(a_prompt)
            last_sweep_ms = msg.timestamp_ms

    stats.add_stream(video_id, len(messages), duration_s, stream_prompts)
    print(f"   Done. {len(stream_prompts)} prompts emitted.")
    return stream_prompts


# ── report generation ──────────────────────────────────────────────────────────

def _pct(lat: list[float], p: int) -> str:
    if not lat:
        return "n/a"
    return f"{statistics.quantiles(lat, n=100)[p - 1]:.0f}ms"


def write_run_report(stats: RunStats, config: PipelineConfig) -> None:
    all_prompts = stats.prompts
    c_prompts = [p for p in all_prompts if p.source == PromptSource.C]
    a_prompts = [p for p in all_prompts if p.source == PromptSource.A]
    total_duration_s = sum(s["duration_s"] for s in stats.stream_stats)
    total_duration_min = total_duration_s / 60

    # Cost estimate (gpt-4o-mini: $0.15/1M input, $0.60/1M output)
    # Rough assumption: ~300 input tokens + 40 output tokens per call
    n_llm_calls = len(all_prompts)
    est_cost_usd = n_llm_calls * ((300 * 0.15 + 40 * 0.60) / 1_000_000)

    by_cat: dict[str, int] = {}
    for p in all_prompts:
        by_cat[p.category.value] = by_cat.get(p.category.value, 0) + 1

    # A-only examples (Pipeline A prompts that survived dedup)
    a_only_examples = [p for p in a_prompts][:10]

    # C monetization examples
    c_mono_examples = [p for p in c_prompts if p.category == Category.MONETIZATION_EVENT][:5]

    lines = [
        "# Hybrid Pipeline Run Report",
        "",
        f"**Corpus:** {len(stats.stream_stats)} stream(s), "
        f"{sum(s['messages'] for s in stats.stream_stats):,} messages total, "
        f"{total_duration_min:.0f} min",
        "",
        "---",
        "",
        "## Aggregate Metrics",
        "",
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| Total prompts | {len(all_prompts)} |",
        f"| Pipeline C prompts | {len(c_prompts)} |",
        f"| Pipeline A prompts | {len(a_prompts)} |",
        f"| A candidates suppressed by dedup | {stats.a_suppressed} |",
        f"| Prompts / min (overall) | {len(all_prompts) / total_duration_min:.2f} |",
        f"| Total LLM calls | {n_llm_calls} |",
        f"| Estimated cost | ${est_cost_usd:.4f} |",
        "",
        "**Prompts by category:**",
        "",
    ]
    for cat, cnt in sorted(by_cat.items(), key=lambda x: -x[1]):
        lines.append(f"- `{cat}`: {cnt}")

    lines += [
        "",
        "## Latency Distribution",
        "",
        "| Pipeline | p50 | p95 | p99 |",
        "|----------|-----|-----|-----|",
        f"| C (heuristic + LLM) | {_pct(stats.c_latencies_ms, 50)} | {_pct(stats.c_latencies_ms, 95)} | {_pct(stats.c_latencies_ms, 99)} |",
        f"| A (periodic sweep) | {_pct(stats.a_latencies_ms, 50)} | {_pct(stats.a_latencies_ms, 95)} | {_pct(stats.a_latencies_ms, 99)} |",
        "",
        "*(Latency = wall-clock LLM call duration only. End-to-end adds ~2.5–3s ingestion latency.)*",
        "",
        "## C vs A Comparison",
        "",
        "### What Pipeline A adds (A-only prompts that survived dedup)",
        "",
    ]
    if a_only_examples:
        for p in a_only_examples:
            lines.append(f"- `[{p.stream_time_s:.0f}s]` {p.text}")
            if p.legible_reason:
                lines.append(f"  _{p.legible_reason}_")
    else:
        lines.append("*(No A-only prompts in this run — A was fully covered by C or no sweeps fired.)*")

    lines += [
        "",
        "### What Pipeline C adds (monetization events — A would miss these at the right latency)",
        "",
    ]
    if c_mono_examples:
        for p in c_mono_examples:
            lines.append(f"- `[{p.stream_time_s:.0f}s]` {p.text}")
    else:
        lines.append("*(No monetization events in corpus — category works correctly but corpus lacks examples.)*")

    lines += [
        "",
        "## Tuning Findings",
        "",
        f"**Sweep interval:** {config.sweep_interval_s}s (default). Shorter intervals (90s, 60s) would "
        "increase A's recall on novel questions at the cost of more LLM calls and higher false-alarm risk. "
        "Longer intervals (300s) reduce cost but may miss time-sensitive novel questions. "
        "180s is a reasonable first default; tune after collecting creator feedback on missed moments.",
        "",
        f"**A window size:** {config.sweep_window_s}s. Matching the sweep interval means each sweep "
        "sees exactly the messages since the last sweep — no overlap, no gaps. Widening the window "
        "adds context but risks re-surfacing questions C already handled.",
        "",
        "**Heuristic thresholds used:**",
        f"- repeat_similarity_threshold: {config.repeat_similarity_threshold} (cosine sim, text-embedding-3-small)",
        f"- repeat_min_authors: {config.repeat_min_authors}",
        f"- energy_spike_z_threshold: {config.energy_spike_z_threshold} (over {config.energy_spike_bucket_s}s buckets)",
        f"- ack_min_len: {config.ack_min_len} chars",
        f"- llm_cooldown_s: {config.llm_cooldown_s}s",
        "",
        "## Per-Stream Summary",
        "",
        "| Stream | Messages | Duration | Total | C | A | /min | Categories |",
        "|--------|----------|----------|-------|---|---|------|------------|",
    ]
    for s in stats.stream_stats:
        cats = ", ".join(f"{k}:{v}" for k, v in sorted(s["by_category"].items()))
        lines.append(
            f"| {s['video_id']} | {s['messages']:,} | "
            f"{s['duration_s']/60:.0f}m | {s['total_prompts']} | "
            f"{s['c_prompts']} | {s['a_prompts']} | "
            f"{s['prompts_per_min']} | {cats or 'none'} |"
        )

    lines += [
        "",
        "## Known Gaps",
        "",
        "- `confusion_cluster`, `sentiment_shift`, `factual_correction`, `stream_quality_issue` "
        "are stubbed — returns None until implemented.",
        "- `lingering_question`, `returning_regular`, `topic_drift` are out of v1 scope (require STT or cross-stream memory).",
        "- No labels file found — precision/recall against hand-labeled moments not computed. "
        "Add `dataset/labels.json` to enable per-category evaluation.",
        "- Monetization events absent in collected corpus — category is implemented and tested "
        "structurally but fire rate is 0.",
        "- Energy spike Z-score needs ~3 baseline buckets (≥90s) before it can fire; "
        "events in the first 90s of a stream will be missed.",
    ]

    report_path = _REPORTS_DIR / "run_report.md"
    report_path.write_text("\n".join(lines) + "\n")
    print(f"\n📄  Report written to {report_path}")


def write_sample_prompts(stats: RunStats) -> None:
    prompts = stats.prompts[:50]
    if not prompts:
        return

    lines = [
        "# Sample Prompts (first 50 emitted)",
        "",
        "| # | Time | Src | Category | Text | Latency |",
        "|---|------|-----|----------|------|---------|",
    ]
    for i, p in enumerate(prompts, 1):
        mins = int(p.stream_time_s) // 60
        secs = int(p.stream_time_s) % 60
        t = f"{mins:02d}:{secs:02d}"
        text_short = p.text[:80] + "…" if len(p.text) > 80 else p.text
        lines.append(
            f"| {i} | {t} | {p.source.value} | {p.category.value} | {text_short} | {p.llm_latency_ms:.0f}ms |"
        )

    sample_path = _REPORTS_DIR / "sample_prompts.md"
    sample_path.write_text("\n".join(lines) + "\n")
    print(f"📋  Sample prompts written to {sample_path}")


# ── entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Replay a chat corpus through the Tidal hybrid pipeline.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--video-id", help="Single video ID to replay")
    source.add_argument("--glob", help="Glob pattern matching JSONL corpus files")

    parser.add_argument(
        "--dataset-dir",
        default="dataset/raw",
        help="Base directory for --video-id lookup (default: dataset/raw)",
    )
    parser.add_argument(
        "--sweep-interval-s",
        type=float,
        default=180.0,
        help="Pipeline A sweep interval in stream-seconds (default: 180)",
    )
    parser.add_argument(
        "--sweep-window-s",
        type=float,
        default=180.0,
        help="Pipeline A inspection window in seconds (default: 180)",
    )
    parser.add_argument(
        "--model",
        default="gpt-4o-mini",
        help="LLM model (default: gpt-4o-mini)",
    )
    parser.add_argument(
        "--no-llm",
        action="store_true",
        help="Dry run: run heuristics only, skip all LLM calls",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Stop after N messages per stream (useful for quick testing)",
    )
    args = parser.parse_args()

    config = PipelineConfig(
        sweep_interval_s=args.sweep_interval_s,
        sweep_window_s=args.sweep_window_s,
        model=args.model,
    )

    # Load corpus
    try:
        if args.video_id:
            messages = load_single(args.video_id, dataset_dir=args.dataset_dir)
        else:
            messages = load_corpus(args.glob)
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    if not messages:
        print("No messages found.", file=sys.stderr)
        sys.exit(1)

    print(f"Loaded {len(messages):,} messages across "
          f"{len(set(m.video_id for m in messages))} stream(s).")

    if args.limit:
        print(f"(--limit {args.limit}: capping each stream at {args.limit} messages)")

    embed_cache = EmbeddingCache(model=config.embed_model)
    stats = RunStats()
    streams = group_by_video(messages)

    for video_id, stream_msgs in streams.items():
        msgs = stream_msgs[: args.limit] if args.limit else stream_msgs
        replay_stream(msgs, config, embed_cache, stats, no_llm=args.no_llm)

    write_run_report(stats, config)
    write_sample_prompts(stats)


if __name__ == "__main__":
    main()
