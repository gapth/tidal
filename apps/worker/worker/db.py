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


def write_prompt(session_id: str, source: str, category: str, content: str) -> None:
    get_client().table("prompts").insert(
        {
            "session_id": session_id,
            "source": source,
            "category": category,
            "content": content,
        }
    ).execute()


def update_session_status(session_id: str, status: str) -> None:
    get_client().table("sessions").update({"status": status}).eq(
        "id", session_id
    ).execute()
