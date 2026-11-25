from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from backend.app.db import clips, engine, exports, insert, matches
from backend.app.pipeline.jobs import export_job, queue

from .common import one, public
from .schemas import Export

router = APIRouter()


@router.post("/clips/{i}/export", status_code=202)
def start_export(i: int, body: Export = Export()) -> dict[str, Any]:
    ids = list(dict.fromkeys(body.clip_ids or [i]))
    with engine.begin() as c:
        base = one(c, clips, i)
        sources = []
        for cid in ids:
            row = one(c, clips, cid)
            if row["match_id"] != base["match_id"]:
                raise HTTPException(422, "Choose clips from one match")
            source = one(c, matches, row["match_id"])
            sources.append(
                dict(row, path=source["path"], match_duration=source["duration_s"])
            )
        key = insert(c, exports, status="queued", progress=0)
    queue.submit(
        export_job,
        key,
        sorted(sources, key=lambda r: r["start_ts"]),
        body.mode,
        body.before,
        body.after,
    )
    return {"job_id": key}


@router.get("/exports/{i}")
def status(i: int) -> dict[str, Any]:
    with engine.connect() as c:
        row = one(c, exports, i)
    return dict(
        public(row),
        download_url=f"/api/exports/{i}/download" if row["status"] == "ready" else None,
    )


@router.get("/exports/{i}/download")
def download(i: int) -> FileResponse:
    with engine.connect() as c:
        row = one(c, exports, i)
    if row["status"] != "ready":
        raise HTTPException(409, "Export is not ready")
    return FileResponse(row["output_path"], filename=Path(row["output_path"]).name)
