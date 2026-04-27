import numpy as np

from .llm import get_client


class EmbeddingCache:
    """Lazy embedding cache backed by text-embedding-3-small.

    Embeds each unique text once; subsequent lookups are in-memory.
    """

    def __init__(self, model: str = "text-embedding-3-small"):
        self.model = model
        self._cache: dict[str, list[float]] = {}
        self._tokens_used: int = 0
        self._calls_made: int = 0

    def embed(self, text: str) -> list[float]:
        if text not in self._cache:
            client = get_client()
            resp = client.embeddings.create(model=self.model, input=[text])
            self._cache[text] = resp.data[0].embedding
            self._tokens_used += resp.usage.prompt_tokens
            self._calls_made += 1
        return self._cache[text]

    def drain_usage(self) -> tuple[int, int]:
        """Return (tokens_used, calls_made) since last drain and reset counters."""
        tokens, calls = self._tokens_used, self._calls_made
        self._tokens_used = 0
        self._calls_made = 0
        return tokens, calls

    def cosine_sim(self, a: str, b: str) -> float:
        va = np.array(self.embed(a), dtype=np.float32)
        vb = np.array(self.embed(b), dtype=np.float32)
        denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
        if denom == 0.0:
            return 0.0
        return float(np.dot(va, vb) / denom)
