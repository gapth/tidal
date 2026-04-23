"""Dedup layer: suppress Pipeline A output already covered by Pipeline C.

When A fires a novel-question prompt, we check whether C surfaced the same
question in the overlapping window. Match criterion: cosine similarity between
A's extracted question text and any of C's recent trigger_texts ≥ threshold.
"""

from .config import PipelineConfig
from .embeddings import EmbeddingCache
from .chat_types import Prompt


class DedupLayer:
    def __init__(self, config: PipelineConfig, embed_cache: EmbeddingCache):
        self.config = config
        self.embed_cache = embed_cache
        self.suppression_count: int = 0

    def is_duplicate(
        self,
        a_prompt: Prompt,
        c_prompts: list[Prompt],
        current_stream_ms: float,
    ) -> bool:
        """Return True if A's prompt is semantically covered by a recent C prompt."""
        if not a_prompt.trigger_texts:
            return False

        a_question = a_prompt.trigger_texts[0]
        window_ms = self.config.dedup_window_s * 1000
        threshold = self.config.dedup_similarity_threshold

        for c_prompt in c_prompts:
            age_ms = current_stream_ms - (c_prompt.stream_time_s * 1000)
            if age_ms > window_ms:
                continue
            for c_text in c_prompt.trigger_texts:
                try:
                    sim = self.embed_cache.cosine_sim(a_question, c_text)
                except Exception:
                    continue
                if sim >= threshold:
                    self.suppression_count += 1
                    return True

        return False
