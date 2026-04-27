"""YouTube live chat collection via liveChatMessages.streamList gRPC endpoint.

Opens a persistent gRPC stream to YouTube and receives chat messages as they
are published. Calls on_message_batch with batches of LiveChatMessage protobuf
objects; sends None as a sentinel when the stream ends.
"""

import asyncio
import json
import logging
import os
import threading
import time
import urllib.request
from typing import Any, Callable

import grpc

from pipeline.chat_types import UsageDelta
from worker import db, stream_list_pb2, stream_list_pb2_grpc

logger = logging.getLogger(__name__)

_MAX_RECONNECTS = 3
_RECONNECT_BACKOFF_S = [5, 15, 30]
_YT_GRPC_TARGET = "dns:///youtube.googleapis.com:443"
_KEEPALIVE_OPTIONS = [
    ("grpc.keepalive_time_ms", 20_000),
    ("grpc.keepalive_timeout_ms", 10_000),
    ("grpc.keepalive_permit_without_calls", 1),
    ("grpc.http2.max_pings_without_data", 0),
]


def _interruptible_sleep(seconds: float, stop: threading.Event) -> None:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline and not stop.is_set():
        time.sleep(0.5)


def _get_live_chat_id(
    video_id: str, api_key: str, stop: threading.Event
) -> str | None:
    """Return the activeLiveChatId for a live video, or None on failure."""
    url = (
        "https://www.googleapis.com/youtube/v3/videos"
        f"?part=liveStreamingDetails&id={video_id}&key={api_key}"
    )
    for attempt in range(_MAX_RECONNECTS + 1):
        if stop.is_set():
            return None
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
            items = data.get("items", [])
            if not items:
                logger.error("No video found for %s", video_id)
                return None
            chat_id = (items[0].get("liveStreamingDetails") or {}).get(
                "activeLiveChatId"
            )
            if not chat_id:
                logger.error("Video %s is not currently live", video_id)
                return None
            logger.info("Resolved liveChatId for %s: %s", video_id, chat_id)
            return chat_id
        except Exception as e:
            logger.warning(
                "liveChatId lookup attempt %d/%d failed: %s",
                attempt + 1,
                _MAX_RECONNECTS + 1,
                e,
            )
            if attempt < _MAX_RECONNECTS:
                _interruptible_sleep(_RECONNECT_BACKOFF_S[attempt], stop)
    return None


def _collect_blocking(
    video_id: str,
    session_id: str,
    api_key: str,
    on_batch: Callable[[list[Any] | None], None],
    stop: threading.Event,
) -> None:
    live_chat_id = _get_live_chat_id(video_id, api_key, stop)
    if live_chat_id is None:
        on_batch(None)
        return
    db.increment_session_usage(session_id, UsageDelta(yt_quota_units=1))

    creds = grpc.ssl_channel_credentials()
    next_page_token: str | None = None
    transient_failures = 0
    _first_message_logged = False

    with grpc.secure_channel(_YT_GRPC_TARGET, creds, options=_KEEPALIVE_OPTIONS) as channel:
        stub = stream_list_pb2_grpc.V3DataLiveChatMessageServiceStub(channel)
        metadata = (("x-goog-api-key", api_key),)

        while not stop.is_set():
            request = stream_list_pb2.LiveChatMessageListRequest(
                part=["snippet", "authorDetails"],
                live_chat_id=live_chat_id,
                page_token=next_page_token,
                max_results=2000,
            )
            call = stub.StreamList(request, metadata=metadata)

            # Daemon thread cancels the gRPC call when stop is signalled
            threading.Thread(
                target=lambda c=call: (stop.wait(), c.cancel()), daemon=True
            ).start()

            try:
                for response in call:
                    if response.next_page_token:
                        next_page_token = response.next_page_token

                    items = [
                        msg
                        for msg in response.items
                        if msg.snippet.has_display_content
                    ]
                    if items:
                        if not _first_message_logged:
                            logger.info(
                                "First message received for %s", video_id
                            )
                            _first_message_logged = True
                        on_batch(items)

                    if response.offline_at:
                        logger.info(
                            "Stream offline_at=%s for %s",
                            response.offline_at,
                            video_id,
                        )
                        on_batch(None)
                        return

                    if stop.is_set():
                        return

                # Server closed stream cleanly — reconnect with next_page_token
                if stop.is_set():
                    return
                logger.info("gRPC stream closed cleanly for %s, reconnecting", video_id)

            except grpc.RpcError as e:
                if stop.is_set() or e.code() == grpc.StatusCode.CANCELLED:
                    return
                transient_failures += 1
                if transient_failures > _MAX_RECONNECTS:
                    logger.error(
                        "gRPC stream exhausted reconnects for %s: %s",
                        video_id,
                        e,
                    )
                    on_batch(None)
                    return
                backoff = _RECONNECT_BACKOFF_S[min(transient_failures - 1, 2)]
                logger.warning(
                    "gRPC error %s for %s, reconnecting in %ds",
                    e.code(),
                    video_id,
                    backoff,
                )
                _interruptible_sleep(backoff, stop)


async def collect(
    video_id: str,
    session_id: str,
    on_message_batch: Callable[[list[Any] | None], None],
    stop: threading.Event | None = None,
) -> None:
    """Start collecting live chat for video_id via the YouTube gRPC stream.

    Calls on_message_batch with batches of LiveChatMessage protobuf objects,
    then None when the stream ends or reconnects are exhausted.
    """
    api_key = os.environ.get("YOUTUBE_API_KEY")
    if not api_key:
        raise RuntimeError("YOUTUBE_API_KEY not set in environment")
    if stop is None:
        stop = threading.Event()
    logger.info(
        "Starting chat collection for session=%s video=%s", session_id, video_id
    )
    try:
        await asyncio.to_thread(
            _collect_blocking, video_id, session_id, api_key, on_message_batch, stop
        )
    except asyncio.CancelledError:
        stop.set()
        raise
    finally:
        stop.set()
    logger.info("Chat collection finished for session=%s", session_id)
