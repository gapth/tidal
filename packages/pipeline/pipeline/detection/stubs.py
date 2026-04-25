"""Stubs for in-scope v1 categories not yet implemented.

Each stub has the correct interface so the category enum is complete and the
architecture is stable for future spikes. Return None until implemented.
"""

from typing import Optional

from ..chat_types import ChatMessage, HeuristicFire


class ConfusionCluster:
    """Flag multiple viewers expressing confusion or requesting re-explanation.

    TODO: keyword cluster (lost, confused, wait what, didn't catch) + LLM
    judgment to filter filler phrases from real confusion.
    """

    def check(self, window: list[ChatMessage]) -> Optional[HeuristicFire]:
        return None


class SentimentShift:
    """Flag a trending change in chat's emotional valence on the current topic.

    TODO: rolling-window sentiment with topic awareness. Start with high
    precision threshold — false positives spook creators mid-stream.
    """

    def check(self, window: list[ChatMessage]) -> Optional[HeuristicFire]:
        return None


class FactualCorrection:
    """Flag chat pushing back on something the creator said, with agreement.

    TODO: requires either STT of creator audio or strong chat-only signal
    (multiple viewers contradicting the same claim). High precision threshold.
    """

    def check(self, window: list[ChatMessage]) -> Optional[HeuristicFire]:
        return None


class StreamQualityIssue:
    """Flag clustering around audio, video, mic, or platform issues.

    TODO: heuristic keyword clustering — audio, can't hear, echo, lag, black
    screen, buffering. Mostly solvable without LLM. Tight latency required.
    """

    def check(self, window: list[ChatMessage]) -> Optional[HeuristicFire]:
        return None
