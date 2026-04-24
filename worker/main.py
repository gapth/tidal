import asyncio
import logging
import os
import threading
import urllib.error
import urllib.request
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse
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


@app.get("/api/probe", response_class=HTMLResponse)
async def probe(v: str = Query(..., description="YouTube video ID")) -> HTMLResponse:
    url = f"https://www.youtube.com/watch?v={v}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return HTMLResponse(content=body, status_code=resp.status)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return HTMLResponse(content=body, status_code=e.code)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


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
    adapter = PipelineAdapter(session_id, video_id)

    def on_batch(messages: list[Any] | None) -> None:
        if messages is None:
            db.update_session_status(session_id, "ended")
            active_sessions.pop(session_id, None)
            logger.info("Session %s ended (stream finished)", session_id)
            return
        for item in messages:
            try:
                prompts = adapter.process_message(item)
            except Exception as exc:
                logger.warning("Pipeline error on message: %s", exc)
                continue
            for p in prompts:
                try:
                    db.write_prompt(session_id, p.source.value, p.category.value, p.text)
                except Exception as exc:
                    logger.warning("DB write error: %s", exc)

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
