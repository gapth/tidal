"""pytchat-based live chat collection.

Runs pytchat in a thread pool (asyncio.to_thread) to avoid blocking the event loop.
Batches messages: calls on_message_batch when 20 messages accumulate or 3 seconds
elapse, whichever comes first. Sends None as a sentinel when the stream ends.
"""

import asyncio
import logging
import threading
import time
from collections import deque
from typing import Any, Callable

import pytchat

logger = logging.getLogger(__name__)

_BATCH_SIZE = 20
_BATCH_INTERVAL_S = 3.0
_MAX_RECONNECTS = 3
_RECONNECT_BACKOFF_S = [5, 15, 30]
_DEAD_STREAM_TIMEOUT_S = 30.0


def _collect_blocking(
    video_id: str,
    on_batch: Callable[[list[Any] | None], None],
    stop: threading.Event,
) -> None:
    """Blocking pytchat loop. Runs in a thread pool executor."""
    attempt = 0
    while attempt <= _MAX_RECONNECTS:
        if stop.is_set():
            return

        try:
            chat = pytchat.create(video_id=video_id, interruptable=False)
        except Exception as exc:
            logger.error("pytchat.create failed for %s: %s", video_id, exc)
            break

        batch: list[Any] = []
        batch_start = time.monotonic()
        dead_since: float | None = None

        while not stop.is_set():
            if not chat.is_alive():
                if dead_since is None:
                    dead_since = time.monotonic()
                elif time.monotonic() - dead_since >= _DEAD_STREAM_TIMEOUT_S:
                    # Stream has been dead long enough — flush and exit
                    if batch:
                        on_batch(batch)
                    on_batch(None)  # sentinel
                    return
                time.sleep(1)
                continue

            dead_since = None

            data = chat.get()
            for item in data.sync_items():
                if stop.is_set():
                    return
                batch.append(item)
                if len(batch) >= _BATCH_SIZE:
                    on_batch(batch)
                    batch = []
                    batch_start = time.monotonic()

            # Flush on time interval even if batch not full
            if batch and time.monotonic() - batch_start >= _BATCH_INTERVAL_S:
                on_batch(batch)
                batch = []
                batch_start = time.monotonic()

            time.sleep(0.5)

        if stop.is_set():
            return

        # Reconnect logic
        attempt += 1
        if attempt <= _MAX_RECONNECTS:
            backoff = _RECONNECT_BACKOFF_S[min(attempt - 1, len(_RECONNECT_BACKOFF_S) - 1)]
            logger.warning(
                "pytchat disconnected for %s, reconnect %d/%d in %ds",
                video_id, attempt, _MAX_RECONNECTS, backoff,
            )
            time.sleep(backoff)

    # Exhausted reconnects
    on_batch(None)


async def collect(
    video_id: str,
    session_id: str,
    on_message_batch: Callable[[list[Any] | None], None],
) -> None:
    """Start collecting live chat for video_id. Calls on_message_batch with
    batches of pytchat items, then None when the stream ends or reconnects
    are exhausted.
    """
    logger.info("Starting chat collection for session=%s video=%s", session_id, video_id)
    stop = threading.Event()
    try:
        await asyncio.to_thread(_collect_blocking, video_id, on_message_batch, stop)
    except asyncio.CancelledError:
        stop.set()
        raise
    finally:
        stop.set()
    logger.info("Chat collection finished for session=%s", session_id)
