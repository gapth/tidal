import time
from openai import OpenAI

_client: OpenAI | None = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI()
    return _client


def complete(
    system: str,
    user: str,
    model: str = "gpt-4o-mini",
    max_tokens: int = 150,
) -> tuple[str, float, int, int]:
    """Call the OpenAI chat completions endpoint.

    Returns (response_text, latency_ms, input_tokens, output_tokens).
    """
    client = get_client()
    t0 = time.perf_counter()
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        max_tokens=max_tokens,
        temperature=0.3,
    )
    latency_ms = (time.perf_counter() - t0) * 1000
    text = (resp.choices[0].message.content or "").strip()
    return text, latency_ms, resp.usage.prompt_tokens, resp.usage.completion_tokens
