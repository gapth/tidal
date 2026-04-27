"""Wraps PipelineC + PipelineA for live use in the worker.

Converts pytchat items to pipeline ChatMessage, manages per-session state,
and coordinates Pipeline A's periodic sweep alongside C's per-message processing.
"""

import logging
import time
from collections import deque
from datetime import datetime
from typing import Any

from pipeline.chat_types import ChatMessage, Prompt, UsageDelta

logger = logging.getLogger(__name__)
from pipeline.config import PipelineConfig
from pipeline.dedup import DedupLayer
from pipeline.detection.pipeline_a import PipelineA
from pipeline.detection.pipeline_c import PipelineC
from pipeline.embeddings import EmbeddingCache

# Protobuf enum integer values → pipeline type strings
_PROTO_TYPE_MAP: dict[int, str] = {
    1: "textMessage",                   # TEXT_MESSAGE_EVENT
    15: "superChatEvent",               # SUPER_CHAT_EVENT
    16: "superChatEvent",               # SUPER_STICKER_EVENT
    7: "membershipItem",                # NEW_SPONSOR_EVENT
    17: "membershipItem",               # MEMBER_MILESTONE_CHAT_EVENT
    19: "giftRedemptionAnnouncement",   # GIFT_MEMBERSHIP_RECEIVED_EVENT
    18: "giftPurchaseAnnouncement",     # MEMBERSHIP_GIFTING_EVENT
}


def _convert_message(item: Any, video_id: str) -> ChatMessage:
    snippet = item.snippet
    author = item.author_details

    published_at = snippet.published_at
    try:
        ts_ms = datetime.fromisoformat(
            published_at.replace("Z", "+00:00")
        ).timestamp() * 1000
    except (ValueError, AttributeError):
        ts_ms = time.time() * 1000

    mapped_type = _PROTO_TYPE_MAP.get(snippet.type, "textMessage")

    detail_kind = snippet.WhichOneof("displayed_content")
    text = snippet.display_message or ""
    if not text:
        if detail_kind == "member_milestone_chat_details":
            text = snippet.member_milestone_chat_details.user_comment or ""
        elif detail_kind == "super_chat_details":
            text = snippet.super_chat_details.user_comment or ""

    amount: str | None = None
    if detail_kind == "super_chat_details":
        amount = snippet.super_chat_details.amount_display_string or None
    elif detail_kind == "super_sticker_details":
        amount = snippet.super_sticker_details.amount_display_string or None

    return ChatMessage(
        video_id=video_id,
        message_id=item.id,
        timestamp_ms=ts_ms,
        timestamp_iso=published_at,
        author=author.display_name or None,
        author_id=author.channel_id or None,
        text=text,
        is_member=bool(author.is_chat_sponsor),
        is_moderator=bool(author.is_chat_moderator),
        type=mapped_type,
        amount=amount,
    )


class PipelineAdapter:
    def __init__(self, video_id: str):
        self.video_id = video_id

        config = PipelineConfig()
        embed_cache = EmbeddingCache(model=config.embed_model)

        self._config = config
        self._embed_cache = embed_cache
        self._pipeline_c = PipelineC(config, embed_cache)
        self._pipeline_a = PipelineA(config)
        self._dedup = DedupLayer(config, embed_cache)

        self._a_window: deque[ChatMessage] = deque()
        self._recent_c_prompts: deque[Prompt] = deque(maxlen=100)

        self._stream_start_ms: float | None = None
        self._last_a_sweep_ms: float | None = None

    def process_message(self, item: Any) -> tuple[list[Prompt], UsageDelta]:
        msg = _convert_message(item, self.video_id)

        if self._stream_start_ms is None:
            self._stream_start_ms = msg.timestamp_ms
            self._last_a_sweep_ms = msg.timestamp_ms

        stream_start_ms = self._stream_start_ms
        last_sweep_ms = self._last_a_sweep_ms or msg.timestamp_ms

        # Maintain Pipeline A's rolling window
        self._a_window.append(msg)
        cutoff = msg.timestamp_ms - self._config.sweep_window_s * 1000
        while self._a_window and self._a_window[0].timestamp_ms < cutoff:
            self._a_window.popleft()

        logger.debug(
            "msg [%s] author=%s text=%.60r",
            msg.type, msg.author, msg.text,
        )

        results: list[Prompt] = []
        delta = UsageDelta()

        # Pipeline C — per-message
        c_prompt, c_delta = self._pipeline_c.process(msg, stream_start_ms)
        delta.llm_calls += c_delta.llm_calls
        delta.llm_input_tokens += c_delta.llm_input_tokens
        delta.llm_output_tokens += c_delta.llm_output_tokens
        if c_prompt:
            logger.info(
                "C fired [%s] latency=%.0fms → %.80r",
                c_prompt.category.value, c_prompt.llm_latency_ms, c_prompt.text,
            )
            self._recent_c_prompts.append(c_prompt)
            results.append(c_prompt)

        # Pipeline A — periodic sweep
        elapsed_since_sweep = msg.timestamp_ms - last_sweep_ms
        if elapsed_since_sweep >= self._config.sweep_interval_s * 1000:
            logger.info(
                "A sweep triggered (%.0fs elapsed, window=%d msgs)",
                elapsed_since_sweep / 1000, len(self._a_window),
            )
            self._last_a_sweep_ms = msg.timestamp_ms
            a_prompt, a_delta = self._pipeline_a.check(
                list(self._a_window), stream_start_ms, msg.timestamp_ms
            )
            delta.llm_calls += a_delta.llm_calls
            delta.llm_input_tokens += a_delta.llm_input_tokens
            delta.llm_output_tokens += a_delta.llm_output_tokens
            if a_prompt:
                current_stream_ms = msg.timestamp_ms - stream_start_ms
                if not self._dedup.is_duplicate(
                    a_prompt, list(self._recent_c_prompts), current_stream_ms
                ):
                    logger.info(
                        "A fired [%s] latency=%.0fms → %.80r",
                        a_prompt.category.value, a_prompt.llm_latency_ms, a_prompt.text,
                    )
                    results.append(a_prompt)
                else:
                    logger.info("A suppressed by dedup")
            else:
                logger.info("A sweep: no prompt")

        # Drain embedding tokens accumulated during heuristic evaluation
        embed_tokens, embed_calls = self._embed_cache.drain_usage()
        delta.embedding_tokens = embed_tokens
        delta.embedding_calls = embed_calls

        return results, delta
