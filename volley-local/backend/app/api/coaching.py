from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.app.coaching import (
    Details,
    GameIn,
    coaching,
    games,
    identities,
    settings,
    summarize,
    youtube,
)
from backend.app.db import clipplayer, clips, engine, insert, matches, players

from .common import one, rows

router = APIRouter()


@router.put("/clips/{i}/coaching")
def save_coaching(i: int, body: Details) -> dict[str, int]:
    with engine.begin() as conn:
        clip = one(conn, clips, i)
        if not clip["start_ts"] <= body.event_time <= clip["end_ts"]:
            raise HTTPException(422, "Contact time must be inside this clip")
        if body.player_id is not None:
            player = one(conn, players, body.player_id)
            if player["match_id"] != clip["match_id"]:
                raise HTTPException(422, "Choose a player from this match")
            if conn.execute(
                identities.select().where(identities.c.source_id == body.player_id)
            ).first():
                raise HTTPException(409, "This player was merged. Refresh the roster.")
        if (
            body.player_id is not None
            and not conn.execute(
                clipplayer.select().where(
                    clipplayer.c.clip_id == i, clipplayer.c.player_id == body.player_id
                )
            ).first()
        ):
            conn.execute(
                clipplayer.insert().values(
                    clip_id=i, player_id=body.player_id, role=body.position
                )
            )
        values = body.model_dump()
        detail = {k: values.pop(k) for k in ("player_id", "event_time", "confirmed")}
        conn.execute(coaching.delete().where(coaching.c.clip_id == i))
        conn.execute(
            coaching.insert().values(clip_id=i, details=json.dumps(values), **detail)
        )
    return {"id": i}


@router.get("/matches/{i}/games")
def list_games(i: int) -> list[dict[str, Any]]:
    return rows(games.select().where(games.c.match_id == i).order_by(games.c.start_ts))


def put_game(conn: Any, match_id: int, body: GameIn, game_id: int | None = None) -> int:
    match = one(conn, matches, match_id)
    if body.start_ts >= match["duration_s"]:
        raise HTTPException(422, "Game start must be inside the video")
    same = games.select().where(
        games.c.match_id == match_id, games.c.start_ts == body.start_ts
    )
    if game_id:
        same = same.where(games.c.id != game_id)
    if conn.execute(same).first():
        raise HTTPException(409, "A game already starts at this time")
    if game_id:
        conn.execute(
            games.update().where(games.c.id == game_id).values(**body.model_dump())
        )
        return game_id
    return insert(conn, games, match_id=match_id, **body.model_dump())


@router.post("/matches/{i}/games")
def add_game(i: int, body: GameIn) -> dict[str, int]:
    with engine.begin() as conn:
        return {"id": put_game(conn, i, body)}


@router.put("/games/{i}")
def edit_game(i: int, body: GameIn) -> dict[str, int]:
    with engine.begin() as conn:
        game = one(conn, games, i)
        return {"id": put_game(conn, game["match_id"], body, i)}


@router.delete("/games/{i}")
def remove_game(i: int) -> dict[str, int]:
    with engine.begin() as conn:
        one(conn, games, i)
        conn.execute(games.delete().where(games.c.id == i))
    return {"id": i}


class Merge(BaseModel):
    target_id: int


@router.post("/players/{i}/identify")
def identify(i: int, body: Merge) -> dict[str, int]:
    with engine.begin() as conn:
        source, target = one(conn, players, i), one(conn, players, body.target_id)
        if i == body.target_id or source["match_id"] != target["match_id"]:
            raise HTTPException(422, "Choose another player in this match")
        if conn.execute(
            identities.select().where(identities.c.source_id.in_([i, body.target_id]))
        ).first():
            raise HTTPException(
                409, "Refresh the roster before identifying this player"
            )
        links = list(
            conn.execute(
                clipplayer.select().where(clipplayer.c.player_id == i)
            ).mappings()
        )
        for link in links:
            existing = conn.execute(
                clipplayer.select().where(
                    clipplayer.c.clip_id == link["clip_id"],
                    clipplayer.c.player_id == body.target_id,
                )
            ).first()
            if not existing:
                conn.execute(
                    clipplayer.insert().values(
                        clip_id=link["clip_id"],
                        player_id=body.target_id,
                        role=link["role"],
                    )
                )
        conn.execute(clipplayer.delete().where(clipplayer.c.player_id == i))
        conn.execute(
            coaching.update()
            .where(coaching.c.player_id == i)
            .values(player_id=body.target_id)
        )
        conn.execute(
            identities.update()
            .where(identities.c.target_id == i)
            .values(target_id=body.target_id)
        )
        conn.execute(identities.insert().values(source_id=i, target_id=body.target_id))
    return {"id": body.target_id, "linked_clips": len(links)}


@router.get("/matches/{i}/coaching-stats")
def coaching_stats(
    i: int, game_id: int | None = None, player_id: int | None = None
) -> dict[str, Any]:
    from .clips import list_clips

    items = list_clips(i)
    if game_id is not None:
        items = [c for c in items if c["game_id"] == game_id]
    if player_id is not None:
        items = [c for c in items if c["coaching"]["player_id"] == player_id]
    return summarize(items)


class Channel(BaseModel):
    url: str


@router.get("/channel")
def channel() -> dict[str, str]:
    with engine.connect() as conn:
        value = (
            conn.execute(settings.select().where(settings.c.key == "channel"))
            .mappings()
            .first()
        )
    return {"url": value["value"] if value else ""}


@router.put("/channel")
def save_channel(body: Channel) -> dict[str, str]:
    try:
        url = youtube(body.url)
    except ValueError as e:
        raise HTTPException(422, str(e))
    with engine.begin() as conn:
        conn.execute(settings.delete().where(settings.c.key == "channel"))
        conn.execute(settings.insert().values(key="channel", value=url))
    return {"url": url}
