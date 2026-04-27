import asyncio
import logging
import os
import threading
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

import worker.chat_collector as chat_collector
import worker.db as db
from worker.pipeline_adapter import PipelineAdapter

logging.basicConfig(level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO))
logger = logging.getLogger(__name__)

app = FastAPI()
active_sessions: dict[str, tuple[asyncio.Task, threading.Event]] = {}


class StartBody(BaseModel):
    video_id: str
    session_id: str


class StopBody(BaseModel):
    session_id: str


@app.get("/health")
async def health() -> dict:
    return {"ok": True}


@app.post("/api/start", status_code=202)
async def start(body: StartBody) -> dict:
    if body.session_id in active_sessions:
        raise HTTPException(status_code=409, detail="Session already active")
    stop_event = threading.Event()
    task = asyncio.create_task(
        run_session(body.video_id, body.session_id, stop_event),
        name=f"session-{body.session_id}",
    )
    active_sessions[body.session_id] = (task, stop_event)
    logger.info("Started session %s for video %s", body.session_id, body.video_id)
    return {"status": "started", "session_id": body.session_id}


@app.post("/api/stop")
async def stop(body: StopBody) -> dict:
    entry = active_sessions.pop(body.session_id, None)
    if entry:
        task, stop_event = entry
        stop_event.set()  # signal the thread directly
        task.cancel()     # also cancel the asyncio wrapper
    db.update_session_status(body.session_id, "stopped")
    return {"status": "stopped"}


async def run_session(video_id: str, session_id: str, stop_event: threading.Event) -> None:
    adapter = PipelineAdapter(video_id)

    def on_batch(messages: list[Any] | None) -> None:
        if messages is None:
            db.update_session_status(session_id, "ended")
            active_sessions.pop(session_id, None)
            logger.info("Session %s ended (stream finished)", session_id)
            return
        for item in messages:
            try:
                prompts, delta = adapter.process_message(item)
            except Exception as exc:
                logger.warning("Pipeline error on message: %s", exc)
                continue
            for p in prompts:
                try:
                    db.write_prompt(session_id, p.source.value, p.category.value, p.text)
                except Exception as exc:
                    logger.warning("DB write error: %s", exc)
            if delta.llm_calls or delta.embedding_calls:
                try:
                    db.increment_session_usage(session_id, delta)
                except Exception as exc:
                    logger.warning("Usage increment error: %s", exc)

    try:
        await chat_collector.collect(video_id, session_id, on_batch, stop=stop_event)
    except asyncio.CancelledError:
        logger.info("Session %s cancelled", session_id)
        db.update_session_status(session_id, "stopped")
    except Exception as exc:
        logger.error("Session %s crashed: %s", session_id, exc)
        db.update_session_status(session_id, "stopped")
    finally:
        active_sessions.pop(session_id, None)
