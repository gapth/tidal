"""Pipeline A — periodic background sweep for novel high-signal questions.

Runs every sweep_interval_s of stream time. Inspects the last sweep_window_s
of chat in a single LLM call. Scoped tightly: returns at most 1 novel
important question that Pipeline C would not have caught.
"""

import time
from typing import Optional

from ..config import PipelineConfig
from ..llm import complete
from ..chat_types import Category, ChatMessage, Prompt, PromptSource, UsageDelta

_SYSTEM = (
    "You are a real-time assistant for a YouTube live streamer. "
    "Identify the single most important question in recent chat. "
    "Your action suggestion must be 10 words or fewer — short and punchy, no full sentences."
)


def _format_debug_message(msg: ChatMessage) -> str:
    author = (msg.author or "viewer").strip() or "viewer"
    handle = author if author.startswith("@") else f"@{author}"
    return f"{handle}: {msg.text}"


class PipelineA:
    def __init__(self, config: PipelineConfig):
        self.config = config

    def check(
        self,
        window: list[ChatMessage],
        stream_start_ms: float,
        sweep_ts_ms: float,
    ) -> tuple[Optional[Prompt], UsageDelta]:
        """Inspect window and return (Prompt, UsageDelta); Prompt is None if nothing found."""
        if not window:
            return None, UsageDelta()

        window_s = self.config.sweep_window_s
        msg_lines = "\n".join(
            f"[{_fmt_time(m.timestamp_ms - stream_start_ms)}] {m.author or 'viewer'}: {m.text}"
            for m in window
        )

        user = (
            f"Here are the last {len(window)} chat messages from the past ~{int(window_s)}s:\n\n"
            f"{msg_lines}\n\n"
            "Identify at most 1 high-signal novel question that:\n"
            "- Has NOT been asked by multiple viewers (it may appear only once)\n"
            "- Is NOT tied to a monetization event\n"
            "- Would genuinely be worth the streamer answering\n\n"
            "If you find one, respond exactly:\n"
            "QUESTION: <the question text> | ACTION: <10 words or fewer>\n\n"
            "If there is none worth surfacing, respond exactly: NONE"
        )

        text, latency_ms, in_tok, out_tok = complete(
            system=_SYSTEM,
            user=user,
            model=self.config.model,
            max_tokens=60,
        )

        delta = UsageDelta()
        delta.add_llm(in_tok, out_tok)

        if not text or text.strip().upper() == "NONE":
            return None, delta

        question_text, action_text = _parse_response(text)
        if not action_text:
            return None, delta

        stream_time_s = (sweep_ts_ms - stream_start_ms) / 1000.0
        video_id = window[0].video_id if window else ""

        return Prompt(
            source=PromptSource.A,
            category=Category.NOVEL_QUESTION,
            text=action_text,
            debug_context=_build_debug_context(window, question_text),
            legible_reason=f"Novel question detected by sweep: {question_text}",
            stream_time_s=stream_time_s,
            emitted_at_ms=time.time() * 1000,
            video_id=video_id,
            trigger_author_ids=[],
            trigger_texts=[question_text] if question_text else [],
            llm_latency_ms=latency_ms,
        ), delta


def _parse_response(text: str) -> tuple[str, str]:
    """Parse 'QUESTION: ... | ACTION: ...' format. Returns (question, action)."""
    if "|" in text:
        parts = text.split("|", 1)
        question = parts[0].replace("QUESTION:", "").strip()
        action = parts[1].replace("ACTION:", "").strip()
        return question, action
    # Fallback: treat the whole response as the action
    return "", text.strip()


def _fmt_time(ms_from_start: float) -> str:
    s = int(ms_from_start / 1000)
    return f"{s // 60:02d}:{s % 60:02d}"


def _build_debug_context(window: list[ChatMessage], question_text: str) -> Optional[str]:
    if not window:
        return None

    normalized_question = _normalize_message_text(question_text)
    if normalized_question:
        for msg in reversed(window):
            normalized_msg = _normalize_message_text(msg.text)
            if normalized_msg == normalized_question or normalized_question in normalized_msg:
                return _format_debug_message(msg)

    recent = window[-5:]
    if not recent:
        return None
    return "Recent sweep context:\n" + "\n".join(_format_debug_message(msg) for msg in recent)


def _normalize_message_text(text: str) -> str:
    return " ".join(text.lower().strip().split())
