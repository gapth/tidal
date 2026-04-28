import os
from supabase import create_client, Client

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        _client = create_client(url, key)
    return _client


def write_prompt(
    session_id: str,
    source: str,
    category: str,
    content: str,
    debug_context: str | None = None,
) -> None:
    get_client().table("prompts").insert(
        {
            "session_id": session_id,
            "source": source,
            "category": category,
            "content": content,
            "debug_context": debug_context,
        }
    ).execute()


def increment_session_usage(session_id: str, delta: "UsageDelta") -> None:
    get_client().rpc("increment_session_usage", {
        "p_session_id": session_id,
        "p_llm_calls": delta.llm_calls,
        "p_llm_input_tokens": delta.llm_input_tokens,
        "p_llm_output_tokens": delta.llm_output_tokens,
        "p_embedding_calls": delta.embedding_calls,
        "p_embedding_tokens": delta.embedding_tokens,
        "p_yt_quota_units": delta.yt_quota_units,
    }).execute()


def update_session_status(session_id: str, status: str) -> None:
    get_client().table("sessions").update({"status": status}).eq(
        "id", session_id
    ).execute()
