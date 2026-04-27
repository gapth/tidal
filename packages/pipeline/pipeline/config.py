from dataclasses import dataclass


@dataclass
class PipelineConfig:
    # Pipeline A: periodic sweep
    sweep_interval_s: float = 180.0   # how often A runs (stream time)
    sweep_window_s: float = 180.0     # how much chat history A inspects

    # Repeated question detection (Pipeline C, heuristic)
    repeat_similarity_threshold: float = 0.82   # cosine sim floor
    repeat_min_len: int = 15                     # min chars to be a candidate question
    repeat_min_authors: int = 2                  # min distinct authors required

    # Energy spike detection (Pipeline C, heuristic)
    energy_spike_bucket_s: float = 30.0          # bucket duration for Z-score
    energy_spike_z_threshold: float = 2.0
    energy_spike_min_buckets: int = 3            # baseline buckets required before firing

    # Message acknowledgment detection (Pipeline C, heuristic)
    ack_min_len: int = 150                       # long message threshold
    ack_first_timer_min_len: int = 60            # first-timer message threshold

    # Confusion cluster detection (Pipeline C, heuristic)
    confusion_min_authors: int = 2
    confusion_similarity_threshold: float = 0.72

    # Sentiment shift detection (Pipeline C, heuristic)
    sentiment_min_authors: int = 3
    sentiment_recent_min_messages: int = 3
    sentiment_recent_ratio_threshold: float = 0.6
    sentiment_baseline_ratio_max: float = 0.25

    # Factual correction detection (Pipeline C, heuristic)
    factual_correction_min_authors: int = 2
    factual_correction_similarity_threshold: float = 0.78

    # Stream quality issue detection (Pipeline C, heuristic)
    stream_quality_min_authors: int = 2
    stream_quality_cooldown_s: float = 30.0

    # Pipeline C general
    c_window_s: float = 90.0         # rolling window for heuristics state
    llm_cooldown_s: float = 12.0     # min gap between C LLM calls (except monetization)
    max_flagged_messages: int = 8    # max messages passed to LLM per C call

    # LLM / embedding models — swap model here to test gpt-4o for quality comparison
    model: str = "gpt-4o-mini"
    embed_model: str = "text-embedding-3-small"

    # Dedup: A output suppressed if semantically covered by C
    dedup_similarity_threshold: float = 0.75
    dedup_window_s: float = 180.0
