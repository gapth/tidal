"""Heuristic detectors for the remaining in-scope v1 categories."""

import re
from collections import Counter
from typing import Optional

from ..config import PipelineConfig
from ..embeddings import EmbeddingCache
from ..chat_types import Category, ChatMessage, HeuristicFire

_WORD_RE = re.compile(r"[a-z0-9']+")

_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "but", "can", "did", "do",
    "does", "for", "from", "get", "got", "had", "has", "have", "how", "i",
    "if", "im", "in", "is", "it", "its", "just", "like", "me", "my", "no",
    "not", "of", "on", "or", "our", "out", "really", "so", "that", "the",
    "their", "them", "there", "they", "this", "to", "too", "up", "was", "we",
    "were", "what", "when", "where", "why", "with", "you", "your",
}

_CONFUSION_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\b(confused|confusing|confusion)\b",
        r"\b(lost|not following)\b",
        r"\b(wait[ ,]+what|what did i miss|what happened)\b",
        r"\b(didn['’]?t catch|missed that|say that again|repeat that)\b",
        r"\b(explain again|can you explain|clarify|what do you mean)\b",
        r"\b(huh\??|wtf)\b",
    )
]

_NEGATIVE_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\b(boring|dragging|slow)\b",
        r"\b(annoying|frustrating|frustrated)\b",
        r"\b(sucks|awful|terrible|bad|worst|trash)\b",
        r"\b(cringe|lame|mid|corny)\b",
        r"\b(hate|disappointed|mad|angry)\b",
        r"\b(unwatchable|scam|scammed|ripoff)\b",
    )
]

_CORRECTION_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\b(actually|correction|to be fair)\b",
        r"\b(that's wrong|you'?re wrong|wrong about)\b",
        r"\b(it'?s not|that'?s not|wasn'?t|isn'?t|didn'?t|doesn'?t)\b",
        r"\b(you mean|meant|i think you meant)\b",
        r"\b(no[, ]+it'?s|nah[, ]+it'?s)\b",
    )
]

_QUALITY_BUCKET_PATTERNS = {
    "audio": re.compile(
        r"\b(no audio|can'?t hear|cant hear|mute|muted|mic|microphone|audio|sound|volume|echo|static)\b",
        re.IGNORECASE,
    ),
    "video": re.compile(
        r"\b(black screen|frozen|freeze|video|camera|webcam|resolution|blurry|pixelated)\b",
        re.IGNORECASE,
    ),
    "lag": re.compile(
        r"\b(lag|lagging|buffering|stutter|stuttering|delay|behind|desync)\b",
        re.IGNORECASE,
    ),
    "connection": re.compile(
        r"\b(disconnected|disconnecting|offline|stream died|dropped)\b",
        re.IGNORECASE,
    ),
}


def _author_key(msg: ChatMessage) -> str:
    return msg.author_id or f"anon:{msg.message_id}"


def _distinct_authors(messages: list[ChatMessage]) -> set[str]:
    return {_author_key(m) for m in messages}


def _tokens(text: str) -> list[str]:
    return [t for t in _WORD_RE.findall(text.lower()) if len(t) >= 3]


def _topic_tokens(text: str) -> set[str]:
    return {t for t in _tokens(text) if t not in _STOPWORDS}


def _shared_topic_count(a: str, b: str) -> int:
    return len(_topic_tokens(a) & _topic_tokens(b))


def _top_topic(messages: list[ChatMessage]) -> tuple[str, int]:
    counts: Counter[str] = Counter()
    for msg in messages:
        counts.update(_topic_tokens(msg.text))
    if not counts:
        return "", 0
    return counts.most_common(1)[0]


class ConfusionCluster:
    """Flag multiple viewers expressing confusion or asking for clarification."""

    def __init__(self, config: PipelineConfig, embed_cache: EmbeddingCache):
        self.config = config
        self.embed_cache = embed_cache

    def _is_confusion(self, text: str) -> bool:
        return any(pattern.search(text) for pattern in _CONFUSION_PATTERNS)

    def check(self, window: list[ChatMessage]) -> Optional[HeuristicFire]:
        if not window:
            return None

        current = window[-1]
        if not self._is_confusion(current.text):
            return None

        cluster: list[ChatMessage] = [current]
        seen_authors = _distinct_authors(cluster)

        for msg in reversed(window[:-1]):
            if _author_key(msg) in seen_authors:
                continue
            if not self._is_confusion(msg.text):
                continue
            try:
                sim = self.embed_cache.cosine_sim(current.text, msg.text)
            except Exception:
                sim = 0.0
            if sim >= self.config.confusion_similarity_threshold or _shared_topic_count(current.text, msg.text) >= 1:
                cluster.append(msg)
                seen_authors.add(_author_key(msg))

        if len(seen_authors) < self.config.confusion_min_authors:
            return None

        return HeuristicFire(
            Category.CONFUSION_CLUSTER,
            list(reversed(cluster[: self.config.max_flagged_messages])),
            current.timestamp_ms,
        )


class SentimentShift:
    """Flag a sudden negative turn in recent chat on a shared topic."""

    def __init__(self, config: PipelineConfig):
        self.config = config

    def _is_negative(self, text: str) -> bool:
        return any(pattern.search(text) for pattern in _NEGATIVE_PATTERNS)

    def check(self, window: list[ChatMessage]) -> Optional[HeuristicFire]:
        if len(window) < 6:
            return None

        current = window[-1]
        if not self._is_negative(current.text):
            return None

        split = len(window) // 2
        earlier = window[:split]
        recent = window[split:]
        recent_negative = [m for m in recent if self._is_negative(m.text)]
        earlier_negative = [m for m in earlier if self._is_negative(m.text)]

        if len(recent_negative) < self.config.sentiment_recent_min_messages:
            return None
        if len(_distinct_authors(recent_negative)) < self.config.sentiment_min_authors:
            return None

        recent_ratio = len(recent_negative) / max(len(recent), 1)
        earlier_ratio = len(earlier_negative) / max(len(earlier), 1)
        if recent_ratio < self.config.sentiment_recent_ratio_threshold:
            return None
        if earlier_ratio > self.config.sentiment_baseline_ratio_max:
            return None

        topic, count = _top_topic(recent_negative)
        if not topic or count < 2:
            return None

        trigger_messages = [m for m in recent_negative if topic in _topic_tokens(m.text)]
        if len(trigger_messages) < self.config.sentiment_recent_min_messages:
            return None

        return HeuristicFire(
            Category.SENTIMENT_SHIFT,
            trigger_messages[: self.config.max_flagged_messages],
            current.timestamp_ms,
        )


class FactualCorrection:
    """Flag multiple viewers making the same correction or contradiction."""

    def __init__(self, config: PipelineConfig, embed_cache: EmbeddingCache):
        self.config = config
        self.embed_cache = embed_cache

    def _is_correction(self, text: str) -> bool:
        return any(pattern.search(text) for pattern in _CORRECTION_PATTERNS)

    def check(self, window: list[ChatMessage]) -> Optional[HeuristicFire]:
        if not window:
            return None

        current = window[-1]
        if len(current.text) < 12 or not self._is_correction(current.text):
            return None

        cluster: list[ChatMessage] = [current]
        seen_authors = _distinct_authors(cluster)

        for msg in reversed(window[:-1]):
            if _author_key(msg) in seen_authors:
                continue
            if len(msg.text) < 12 or not self._is_correction(msg.text):
                continue
            try:
                sim = self.embed_cache.cosine_sim(current.text, msg.text)
            except Exception:
                sim = 0.0
            if sim >= self.config.factual_correction_similarity_threshold or _shared_topic_count(current.text, msg.text) >= 2:
                cluster.append(msg)
                seen_authors.add(_author_key(msg))

        if len(seen_authors) < self.config.factual_correction_min_authors:
            return None

        return HeuristicFire(
            Category.FACTUAL_CORRECTION,
            list(reversed(cluster[: self.config.max_flagged_messages])),
            current.timestamp_ms,
        )


class StreamQualityIssue:
    """Flag clustered complaints about audio, video, or connection issues."""

    def __init__(self, config: PipelineConfig):
        self.config = config
        self._last_fired_at_ms_by_bucket: dict[str, float] = {}

    def _bucket(self, text: str) -> str | None:
        for bucket, pattern in _QUALITY_BUCKET_PATTERNS.items():
            if pattern.search(text):
                return bucket
        return None

    def check(self, window: list[ChatMessage]) -> Optional[HeuristicFire]:
        if not window:
            return None

        current = window[-1]
        bucket = self._bucket(current.text)
        if not bucket:
            return None

        cluster = [current]
        seen_authors = _distinct_authors(cluster)

        for msg in reversed(window[:-1]):
            if _author_key(msg) in seen_authors:
                continue
            if self._bucket(msg.text) == bucket:
                cluster.append(msg)
                seen_authors.add(_author_key(msg))

        if len(seen_authors) < self.config.stream_quality_min_authors:
            return None
        last_fired_at_ms = self._last_fired_at_ms_by_bucket.get(bucket)
        if (
            last_fired_at_ms is not None
            and (current.timestamp_ms - last_fired_at_ms) < self.config.stream_quality_cooldown_s * 1000
        ):
            return None
        self._last_fired_at_ms_by_bucket[bucket] = current.timestamp_ms

        return HeuristicFire(
            Category.STREAM_QUALITY_ISSUE,
            list(reversed(cluster[: self.config.max_flagged_messages])),
            current.timestamp_ms,
        )
