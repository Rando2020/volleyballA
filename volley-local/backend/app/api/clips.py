from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.engine import Connection
from starlette.responses import Response

from backend.app.db import clipplayer, clips, cliptag, engine, matches, players, tags

from .common import one, public
from .schemas import BulkChanges, BulkDelete, Patch

router = APIRouter()


@router.get("/matches/{i}/clips")
def list_clips(i: int) -> list[dict[str, Any]]:
    with engine.connect() as c:
        one(c, matches, i)
        selected = select(clips.c.id).where(
            clips.c.match_id == i, clips.c.deleted == False
        )
        result = {
            r["id"]: dict(public(r), tags=[], players=[])
            for r in c.execute(
                clips.select()
                .where(clips.c.id.in_(selected))
                .order_by(clips.c.start_ts)
            ).mappings()
        }
        for r in c.execute(
            cliptag.select()
            .where(cliptag.c.clip_id.in_(selected))
            .order_by(cliptag.c.tag_id)
        ):
            result[r.clip_id]["tags"].append(r.tag_id)
        for r in c.execute(
            clipplayer.select().where(clipplayer.c.clip_id.in_(selected))
        ):
            result[r.clip_id]["players"].append(
                dict(player_id=r.player_id, role=r.role)
            )
        from backend.app.coaching import coaching, game_at, games, record

        book = [
            dict(r)
            for r in c.execute(games.select().where(games.c.match_id == i)).mappings()
        ]
        details = {
            r["clip_id"]: dict(r)
            for r in c.execute(
                coaching.select().where(coaching.c.clip_id.in_(selected))
            ).mappings()
        }
        for clip in result.values():
            clip["coaching"] = record(details.get(clip["id"]), clip["start_ts"])
            clip["game_id"] = game_at(book, clip["coaching"]["event_time"])
            clip["coaching"]["game_id"] = clip["game_id"]
        return list(result.values())


@router.get("/clips/{i}/video")
def clip_video(i: int) -> FileResponse:
    with engine.connect() as c:
        return FileResponse(one(c, clips, i)["video_path"], media_type=None)


@router.get("/clips/{i}/tracking", response_model=None)
def tracking(i: int) -> Response | list[dict[str, Any]]:
    with engine.connect() as c:
        path = Path(one(c, clips, i)["video_path"]).with_suffix(".tracks.json")
    return FileResponse(path, media_type="application/json") if path.exists() else []


@router.get("/clips/{i}/thumb")
def thumb(i: int) -> FileResponse:
    with engine.connect() as c:
        return FileResponse(one(c, clips, i)["thumb_path"], media_type="image/jpeg")


@router.patch("/clips/{i}")
def patch(i: int, body: Patch) -> dict[str, Any]:
    with engine.begin() as c:
        apply_patch(c, i, body)
    return {"id": i}


def apply_patch(c: Connection, i: int, body: Patch) -> None:
    row = one(c, clips, i)
    if body.players:
        from backend.app.coaching import identities

        if c.execute(
            identities.select().where(
                identities.c.source_id.in_([p.player_id for p in body.players])
            )
        ).first():
            raise HTTPException(409, "This player was merged. Refresh the roster.")

    for table, ids, field, records in [
        (cliptag, body.tags, "tag_id", [{"tag_id": k} for k in set(body.tags or [])]),
        (
            clipplayer,
            body.players,
            "player_id",
            [p.model_dump() for p in body.players or []],
        ),
    ]:
        if ids is None:
            continue
        valid = (
            select(tags.c.id)
            if table is cliptag
            else select(players.c.id).where(players.c.match_id == row["match_id"])
        )
        values = [r[field] for r in records]
        if len(set(values)) != len(values) or set(values) - set(
            c.execute(valid).scalars()
        ):
            raise HTTPException(422, "Invalid tag or player assignment")
        c.execute(table.delete().where(table.c.clip_id == i))
        if records:
            c.execute(table.insert(), [dict(clip_id=i, **v) for v in records])
    values = body.model_dump(exclude={"tags", "players"}, exclude_none=True)
    if values:
        c.execute(clips.update().where(clips.c.id == i).values(**values))


@router.delete("/clips/{i}")
def delete(i: int) -> dict[str, Any]:
    with engine.begin() as c:
        one(c, clips, i)
        c.execute(clips.update().where(clips.c.id == i).values(deleted=True))
    return {"id": i}


@router.patch("/bulk/clips")
def bulk_patch(body: BulkChanges) -> dict[str, Any]:
    with engine.begin() as c:
        for change in body.changes:
            apply_patch(c, change.id, Patch(**change.model_dump(exclude={"id"})))
    return {"updated": len(body.changes)}


@router.post("/bulk/delete")
def bulk_delete(body: BulkDelete) -> dict[str, Any]:
    with engine.begin() as c:
        ids = set(body.ids)
        count = c.execute(
            clips.update()
            .where(clips.c.id.in_(ids), clips.c.deleted == False)
            .values(deleted=True)
        ).rowcount
        if count != len(ids):
            raise HTTPException(409, "Selection changed. Refresh the match.")
    return {"deleted": count}
