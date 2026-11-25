from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.responses import Response

from backend.app.config import UPLOADS
from backend.app.db import engine, insert, matches, players
from backend.app.pipeline.ingest import probe
from backend.app.pipeline.jobs import analyze, queue

from .common import one, public, rows
from .schemas import PlayerIn

router = APIRouter()


@router.post("/matches", status_code=202)
def upload(file: UploadFile) -> dict[str, Any]:
    directory = UPLOADS / uuid.uuid4().hex
    directory.mkdir(parents=True)
    path = directory / "source.media"
    try:
        with path.open("wb") as f:
            shutil.copyfileobj(file.file, f)
        info = probe(path)
        (directory / "metadata.json").write_text(json.dumps(info))
    except Exception:
        shutil.rmtree(directory)
        raise HTTPException(422, "Could not decode the uploaded video")
    finally:
        file.file.close()
    with engine.begin() as c:
        key = insert(
            c,
            matches,
            filename=Path(file.filename or "Match").name,
            path=str(path),
            status="queued",
            **info,
        )

    queue.submit(analyze, key, str(path), info["duration_s"])
    return {"match_id": key}


@router.get("/matches")
def all_matches() -> list[dict[str, Any]]:
    return [public(r) for r in rows(matches.select().order_by(matches.c.id.desc()))]


@router.get("/matches/{i}")
def match(i: int) -> dict[str, Any]:
    with engine.connect() as c:
        return public(one(c, matches, i))


@router.get("/matches/{i}/action-suggestions", response_model=None)
def action_suggestions(i: int) -> Response | dict[str, Any]:
    with engine.connect() as c:
        row = one(c, matches, i)
    if row["status"] != "ready":
        raise HTTPException(409, "Analysis is not ready")
    report = Path(row["path"]).parent / "action-suggestions.json"
    if not report.is_file():
        return {"status": "unavailable", "model": None, "samples": []}
    return FileResponse(report, media_type="application/json")


@router.post("/matches/{i}/retry", status_code=202)
def retry(i: int) -> dict[str, Any]:
    with engine.begin() as c:
        row = one(c, matches, i)
        changed = c.execute(
            matches.update()
            .where(
                matches.c.id == i,
                matches.c.status.in_(["failed", "needs_manual_review"]),
            )
            .values(status="queued", error=None, progress=0)
        )
        if not changed.rowcount:
            raise HTTPException(409, "Only failed analysis can retry")
    queue.submit(analyze, i, row["path"], row["duration_s"])
    return {"match_id": i}


@router.get("/matches/{i}/players")
def roster(i: int) -> list[dict[str, Any]]:
    from backend.app.coaching import identities

    return rows(
        players.select().where(
            players.c.match_id == i,
            players.c.id.not_in(
                identities.select().with_only_columns(identities.c.source_id)
            ),
        )
    )


@router.post("/matches/{i}/players")
def new_player(i: int, body: PlayerIn) -> dict[str, Any]:
    with engine.begin() as c:
        one(c, matches, i)
        return {"id": insert(c, players, match_id=i, **body.model_dump())}


@router.patch("/players/{i}")
def rename(i: int, body: PlayerIn) -> dict[str, Any]:
    with engine.begin() as c:
        one(c, players, i)
        c.execute(players.update().where(players.c.id == i).values(**body.model_dump()))
    return {"id": i}


@router.get("/matches/{i}/video")
def source_video(i: int) -> FileResponse:
    with engine.connect() as c:
        match = one(c, matches, i)
    import mimetypes

    return FileResponse(
        match["path"],
        media_type=mimetypes.guess_type(match["filename"])[0]
        or "application/octet-stream",
    )
