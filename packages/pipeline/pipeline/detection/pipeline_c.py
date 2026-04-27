"""Pipeline C — per-message heuristic pre-filter + LLM interpret.

Heuristics in priority order:
  1. monetization_event
  2. stream_quality_issue
  3. repeated_question
  4. confusion_cluster
  5. factual_correction
  6. sentiment_shift
  7. energy_spike
  8. message_acknowledgment

Urgent categories can bypass the normal cooldown. Any fired heuristics are
collapsed into a single LLM call that returns one short streamer action.
"""

import re
import time
from collections import deque
from typing import Optional

from ..config import PipelineConfig
from ..embeddings import EmbeddingCache
from ..llm import complete
from ..chat_types import Category, ChatMessage, HeuristicFire, Prompt, PromptSource, UsageDelta
from .stubs import ConfusionCluster, FactualCorrection, SentimentShift, StreamQualityIssue

_BOT_CMD = re.compile(r"^[!#]")
_BOT_PROMO = re.compile(r"https?://", re.IGNORECASE)
_ENDS_QUESTION = re.compile(r"\?\s*$")

_MONETIZATION_TYPES = {
    "superChatEvent",
    "membershipItem",
    "giftPurchaseAnnouncement",
    "giftRedemptionAnnouncement",
}

_URGENT_CATEGORIES = {
    Category.MONETIZATION_EVENT,
    Category.STREAM_QUALITY_ISSUE,
}

_SYSTEM = (
    "You are a real-time assistant helping a YouTube live streamer notice what matters in chat. "
    "You are given a few specific messages that triggered an automated alert. "
    "In ONE short sentence, tell the streamer what to do or say. Be specific and concrete. No preamble."
)


class EnergySpikeDetector:
    """Fixed-bucket Z-score energy spike detector."""

    def __init__(self, bucket_s: float, z_threshold: float, min_buckets: int):
        self.bucket_s = bucket_s
        self.z_threshold = z_threshold
        self.min_buckets = min_buckets
        self._completed: deque[int] = deque(maxlen=20)
        self._bucket_start_ms: Optional[float] = None
        self._bucket_count: int = 0

    def observe(self, ts_ms: float) -> bool:
        """Feed one non-noise message. Returns True if an energy spike is detected."""
        if self._bucket_start_ms is None:
            self._bucket_start_ms = ts_ms
            self._bucket_count = 1
            return False

        if ts_ms - self._bucket_start_ms >= self.bucket_s * 1000:
            self._completed.append(self._bucket_count)
            self._bucket_start_ms = ts_ms
            self._bucket_count = 1
        else:
            self._bucket_count += 1

        if len(self._completed) < self.min_buckets:
            return False

        counts = list(self._completed)
        mean = sum(counts) / len(counts)
        variance = sum((x - mean) ** 2 for x in counts) / len(counts)
        std = variance ** 0.5
        if std < 1.0:
            return False

        z = (self._bucket_count - mean) / std
        return z > self.z_threshold


class PipelineC:
    def __init__(self, config: PipelineConfig, embed_cache: EmbeddingCache):
        self.config = config
        self.embed_cache = embed_cache

        self._window: deque[ChatMessage] = deque()
        self._seen_authors: set[str] = set()
        self._last_llm_at_ms: float = 0.0
        self._last_ack_author: Optional[str] = None
        self._energy_detector = EnergySpikeDetector(
            bucket_s=config.energy_spike_bucket_s,
            z_threshold=config.energy_spike_z_threshold,
            min_buckets=config.energy_spike_min_buckets,
        )
        self._confusion_cluster = ConfusionCluster(config, embed_cache)
        self._sentiment_shift = SentimentShift(config)
        self._factual_correction = FactualCorrection(config, embed_cache)
        self._stream_quality_issue = StreamQualityIssue(config)

    def process(self, msg: ChatMessage, stream_start_ms: float) -> tuple[Optional[Prompt], UsageDelta]:
        """Process one message. Returns (Prompt, UsageDelta); Prompt is None if LLM was not invoked."""
        self._update_window(msg)
        self._seen_authors.add(msg.author_id or "")

        # 1. Monetization — immediate, bypass cooldown
        if self._is_monetization(msg):
            return self._call_llm(
                [HeuristicFire(Category.MONETIZATION_EVENT, [msg], msg.timestamp_ms)],
                stream_start_ms=stream_start_ms,
                bypass_cooldown=True,
            )

        if self._is_noise(msg):
            return None, UsageDelta()

        fires: list[HeuristicFire] = []

        # 2. Stream quality issue
        quality_issue = self._stream_quality_issue.check(list(self._window))
        if quality_issue:
            fires.append(quality_issue)

        # 3. Repeated question
        rq = self._check_repeated_question(msg)
        if rq:
            fires.append(rq)

        # 4. Confusion cluster
        confusion = self._confusion_cluster.check(list(self._window))
        if confusion:
            fires.append(confusion)

        # 5. Factual correction
        correction = self._factual_correction.check(list(self._window))
        if correction:
            fires.append(correction)

        # 6. Sentiment shift
        sentiment = self._sentiment_shift.check(list(self._window))
        if sentiment:
            fires.append(sentiment)

        # 7. Energy spike
        if self._energy_detector.observe(msg.timestamp_ms):
            fires.append(HeuristicFire(
                Category.ENERGY_SPIKE,
                list(self._window)[-self.config.max_flagged_messages:],
                msg.timestamp_ms,
            ))

        # 8. Message acknowledgment
        ack = self._check_acknowledgment(msg)
        if ack:
            fires.append(ack)

        bypass_cooldown = any(f.category in _URGENT_CATEGORIES for f in fires)
        if fires and (bypass_cooldown or self._cooldown_ok(msg.timestamp_ms)):
            return self._call_llm(
                fires,
                stream_start_ms=stream_start_ms,
                bypass_cooldown=bypass_cooldown,
            )

        return None, UsageDelta()

    # ── private helpers ────────────────────────────────────────────────────────

    def _update_window(self, msg: ChatMessage) -> None:
        self._window.append(msg)
        cutoff = msg.timestamp_ms - self.config.c_window_s * 1000
        while self._window and self._window[0].timestamp_ms < cutoff:
            self._window.popleft()

    def _is_noise(self, msg: ChatMessage) -> bool:
        return bool(_BOT_CMD.match(msg.text) or _BOT_PROMO.search(msg.text))

    def _is_monetization(self, msg: ChatMessage) -> bool:
        return msg.type in _MONETIZATION_TYPES or msg.amount is not None

    def _cooldown_ok(self, ts_ms: float) -> bool:
        return (ts_ms - self._last_llm_at_ms) >= self.config.llm_cooldown_s * 1000

    def _check_repeated_question(self, msg: ChatMessage) -> Optional[HeuristicFire]:
        if not _ENDS_QUESTION.search(msg.text):
            return None
        if len(msg.text) < self.config.repeat_min_len:
            return None

        questions = [
            m for m in self._window
            if m.message_id != msg.message_id
            and _ENDS_QUESTION.search(m.text)
            and len(m.text) >= self.config.repeat_min_len
            and not self._is_noise(m)
        ]

        cluster: list[ChatMessage] = [msg]
        seen_authors: set[str] = {msg.author_id or ""}

        for q in questions:
            if (q.author_id or "") in seen_authors:
                continue
            try:
                sim = self.embed_cache.cosine_sim(msg.text, q.text)
            except Exception:
                continue
            if sim >= self.config.repeat_similarity_threshold:
                cluster.append(q)
                seen_authors.add(q.author_id or "")

        if len(seen_authors) >= self.config.repeat_min_authors:
            return HeuristicFire(
                Category.REPEATED_QUESTION,
                cluster[: self.config.max_flagged_messages],
                msg.timestamp_ms,
            )
        return None

    def _check_acknowledgment(self, msg: ChatMessage) -> Optional[HeuristicFire]:
        is_long = len(msg.text) > self.config.ack_min_len
        is_mod = msg.is_moderator
        is_first_timer = (
            (msg.author_id or "") not in self._seen_authors
            and len(msg.text) > self.config.ack_first_timer_min_len
        )

        if not (is_long or is_mod or is_first_timer):
            return None
        # Avoid firing twice in a row for the same author
        if msg.author_id and msg.author_id == self._last_ack_author:
            return None
        self._last_ack_author = msg.author_id
        return HeuristicFire(Category.MESSAGE_ACKNOWLEDGMENT, [msg], msg.timestamp_ms)

    def _call_llm(
        self,
        fires: list[HeuristicFire],
        stream_start_ms: float,
        bypass_cooldown: bool = False,
    ) -> tuple[Optional[Prompt], UsageDelta]:
        categories = [f.category.value for f in fires]
        all_msgs: dict[str, ChatMessage] = {}
        for f in fires:
            for m in f.trigger_messages:
                all_msgs[m.message_id] = m

        top_msgs = list(all_msgs.values())[: self.config.max_flagged_messages]
        msg_str = "\n".join(f"- {m.text}" for m in top_msgs)
        trigger_str = ", ".join(categories)

        user = f"Alert: {trigger_str}\n\nMessages:\n{msg_str}\n\nWhat should the streamer do?"
        text, latency_ms, in_tok, out_tok = complete(
            system=_SYSTEM,
            user=user,
            model=self.config.model,
            max_tokens=120,
        )

        delta = UsageDelta()
        delta.add_llm(in_tok, out_tok)

        if not text:
            return None, delta

        if not bypass_cooldown:
            # Record time of LLM call against the message timestamp of the first fire
            self._last_llm_at_ms = fires[0].fired_at_ms

        primary_category = fires[0].category
        stream_time_s = (fires[0].fired_at_ms - stream_start_ms) / 1000.0

        return Prompt(
            source=PromptSource.C,
            category=primary_category,
            text=text,
            legible_reason=f"Heuristic(s) fired: {trigger_str}",
            stream_time_s=stream_time_s,
            emitted_at_ms=time.time() * 1000,
            video_id=top_msgs[0].video_id if top_msgs else "",
            trigger_author_ids=[m.author_id or "" for m in top_msgs],
            trigger_texts=[m.text for m in top_msgs],
            llm_latency_ms=latency_ms,
        ), delta
