"""pytchat-based live chat collection.

Runs pytchat in a thread pool (asyncio.to_thread) to avoid blocking the event loop.
Batches messages: calls on_message_batch when 20 messages accumulate or 3 seconds
elapse, whichever comes first. Sends None as a sentinel when the stream ends.
"""

import asyncio
import logging
import threading
import time
import urllib.request
from collections import deque
from typing import Any, Callable

import pytchat

logger = logging.getLogger(__name__)

_BATCH_SIZE = 20
_BATCH_INTERVAL_S = 3.0
_MAX_RECONNECTS = 3
_RECONNECT_BACKOFF_S = [5, 15, 30]
_DEAD_STREAM_TIMEOUT_S = 30.0


def _probe_youtube(video_id: str) -> None:
    """Fetch the YouTube watch page and log signals that distinguish bot detection from a bad video ID."""
    url = f"https://m.youtube.com/watch?v={video_id}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            status = resp.status
            body = resp.read(16384).decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        logger.info(
            "YouTube probe: HTTP %s for %s — likely bot-blocked or rate-limited",
            e.code,
            video_id,
        )
        return
    except Exception as e:
        logger.info("YouTube probe: request failed for %s: %s", video_id, e)
        return

    body_start = (
        body[body.lower().find("<body") : body.lower().find("<body") + 500]
        if "<body" in body.lower()
        else body[:500]
    )

    if "consent.youtube.com" in body or "consent" in body.lower()[:500]:
        logger.info(
            "YouTube probe: consent/cookie wall detected for %s (status=%s) — bot detection likely",
            video_id,
            status,
        )
    elif "og:title" in body or '"videoId"' in body:
        logger.info(
            "YouTube probe: video page looks normal for %s (status=%s) — pytchat parsing issue, not bot detection",
            video_id,
            status,
        )
    elif (
        "why this page" in body.lower()
        or "unusual traffic" in body.lower()
        or "captcha" in body.lower()
    ):
        logger.info(
            "YouTube probe: bot/captcha challenge detected for %s (status=%s)",
            video_id,
            status,
        )
    else:
        logger.info(
            "YouTube probe: unexpected page for %s (status=%s) — body start: %s",
            video_id,
            status,
            body_start,
        )


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
            _probe_youtube(video_id)
            break

        batch: list[Any] = []
        batch_start = time.monotonic()
        dead_since: float | None = None
        _first_alive_logged = False
        _first_message_logged = False

        while not stop.is_set():
            if not _first_alive_logged:
                alive = chat.is_alive()
                logger.info(
                    "pytchat.is_alive() = %s on first check for %s", alive, video_id
                )
                _first_alive_logged = True
                if not alive:
                    dead_since = time.monotonic()
                    time.sleep(1)
                    continue

            if not chat.is_alive():
                if dead_since is None:
                    dead_since = time.monotonic()
                    logger.info("pytchat stream went dead for %s", video_id)
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
                if not _first_message_logged:
                    logger.info("pytchat: first message received for %s", video_id)
                    _first_message_logged = True
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
            backoff = _RECONNECT_BACKOFF_S[
                min(attempt - 1, len(_RECONNECT_BACKOFF_S) - 1)
            ]
            logger.warning(
                "pytchat disconnected for %s, reconnect %d/%d in %ds",
                video_id,
                attempt,
                _MAX_RECONNECTS,
                backoff,
            )
            time.sleep(backoff)

    # Exhausted reconnects
    on_batch(None)


async def collect(
    video_id: str,
    session_id: str,
    on_message_batch: Callable[[list[Any] | None], None],
    stop: threading.Event | None = None,
) -> None:
    """Start collecting live chat for video_id. Calls on_message_batch with
    batches of pytchat items, then None when the stream ends or reconnects
    are exhausted.

    Pass an external stop event to allow the caller to signal the thread
    directly without relying on asyncio task cancellation propagation.
    """
    if stop is None:
        stop = threading.Event()
    logger.info(
        "Starting chat collection for session=%s video=%s", session_id, video_id
    )
    try:
        await asyncio.to_thread(_collect_blocking, video_id, on_message_batch, stop)
    except asyncio.CancelledError:
        stop.set()
        raise
    finally:
        stop.set()
    logger.info("Chat collection finished for session=%s", session_id)
