"""Wraps PipelineC + PipelineA for live use in the worker.

Converts pytchat items to pipeline ChatMessage, manages per-session state,
and coordinates Pipeline A's periodic sweep alongside C's per-message processing.
"""

import logging
import time
from collections import deque
from typing import Any

from pipeline.chat_types import ChatMessage, Prompt

logger = logging.getLogger(__name__)
from pipeline.config import PipelineConfig
from pipeline.dedup import DedupLayer
from pipeline.detection.pipeline_a import PipelineA
from pipeline.detection.pipeline_c import PipelineC
from pipeline.embeddings import EmbeddingCache

# pytchat type name → pipeline type name
_PYTCHAT_TYPE_MAP: dict[str, str] = {
    "superChat": "superChatEvent",
    "membershipItem": "membershipItem",
    "giftPurchase": "giftPurchaseAnnouncement",
    "giftRedemption": "giftRedemptionAnnouncement",
    "textMessage": "textMessage",
}


def _convert_message(item: Any, video_id: str) -> ChatMessage:
    raw_ts = item.timestamp
    ts_ms = raw_ts / 1000 if isinstance(raw_ts, (int, float)) else raw_ts.timestamp() * 1000
    raw_type = getattr(item, "type", "textMessage")
    mapped_type = _PYTCHAT_TYPE_MAP.get(raw_type, raw_type)
    amount = getattr(item, "amountString", None) or None
    author = item.author
    is_member = (
        getattr(author, "isChatMember", False)
        or getattr(author, "isMember", False)
    )
    return ChatMessage(
        video_id=video_id,
        message_id=item.id,
        timestamp_ms=ts_ms,
        timestamp_iso=item.datetime,
        author=getattr(author, "name", None),
        author_id=getattr(author, "channelId", None),
        text=item.message or "",
        is_member=bool(is_member),
        is_moderator=bool(getattr(author, "isModerator", False)),
        type=mapped_type,
        amount=str(amount) if amount else None,
    )


class PipelineAdapter:
    def __init__(self, session_id: str, video_id: str):
        self.session_id = session_id
        self.video_id = video_id

        config = PipelineConfig()
        embed_cache = EmbeddingCache(model=config.embed_model)

        self._config = config
        self._pipeline_c = PipelineC(config, embed_cache)
        self._pipeline_a = PipelineA(config)
        self._dedup = DedupLayer(config, embed_cache)

        self._a_window: deque[ChatMessage] = deque()
        self._recent_c_prompts: deque[Prompt] = deque(maxlen=100)

        self._stream_start_ms: float | None = None
        self._last_a_sweep_ms: float | None = None

    def process_message(self, item: Any) -> list[Prompt]:
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

        # Pipeline C — per-message
        c_prompt = self._pipeline_c.process(msg, stream_start_ms)
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
            a_prompt = self._pipeline_a.check(
                list(self._a_window), stream_start_ms, msg.timestamp_ms
            )
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

        return results
