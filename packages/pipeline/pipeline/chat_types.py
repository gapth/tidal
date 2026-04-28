from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class PromptSource(str, Enum):
    C = "C"
    A = "A"


class Category(str, Enum):
    MONETIZATION_EVENT = "monetization_event"
    REPEATED_QUESTION = "repeated_question"
    ENERGY_SPIKE = "energy_spike"
    MESSAGE_ACKNOWLEDGMENT = "message_acknowledgment"
    NOVEL_QUESTION = "novel_question"
    # Stubs — in-scope v1 but not yet implemented
    CONFUSION_CLUSTER = "confusion_cluster"
    SENTIMENT_SHIFT = "sentiment_shift"
    FACTUAL_CORRECTION = "factual_correction"
    STREAM_QUALITY_ISSUE = "stream_quality_issue"


@dataclass
class ChatMessage:
    video_id: str
    message_id: str
    timestamp_ms: float
    timestamp_iso: str
    author: Optional[str]
    author_id: Optional[str]
    text: str
    is_member: bool
    is_moderator: bool
    type: str
    amount: Optional[str]


@dataclass
class HeuristicFire:
    category: Category
    trigger_messages: list[ChatMessage]
    fired_at_ms: float


@dataclass
class UsageDelta:
    llm_calls: int = 0
    llm_input_tokens: int = 0
    llm_output_tokens: int = 0
    embedding_calls: int = 0
    embedding_tokens: int = 0
    yt_quota_units: int = 0

    def add_llm(self, input_tokens: int, output_tokens: int) -> None:
        self.llm_calls += 1
        self.llm_input_tokens += input_tokens
        self.llm_output_tokens += output_tokens


@dataclass
class Prompt:
    source: PromptSource
    category: Category
    text: str
    debug_context: Optional[str]
    legible_reason: str
    stream_time_s: float       # seconds from start of this stream
    emitted_at_ms: float       # wall-clock unix ms when emitted
    video_id: str
    trigger_author_ids: list[str] = field(default_factory=list)
    trigger_texts: list[str] = field(default_factory=list)
    llm_latency_ms: float = 0.0
