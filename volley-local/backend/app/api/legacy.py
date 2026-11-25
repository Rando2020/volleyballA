"""Explicit mapping of a CourtSense backup's source recording to a local match."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.app.coaching import Details, coaching, games, imports, identities
from backend.app.db import (
    clipplayer,
    clips,
    cliptag,
    engine,
    insert,
    matches,
    players,
    tags,
)
from backend.app.pipeline.jobs import materialize

from .coaching import GameIn, put_game
from .common import one

router = APIRouter()


class ImportRequest(BaseModel):
    media_id: str
    backup: dict[str, Any]
    confirm_mapping: bool = False


@router.post("/matches/{i}/import-courtsense")
def import_backup(i: int, body: ImportRequest) -> dict[str, Any]:
    if body.backup.get("sample"):
        raise HTTPException(
            422, "Choose your saved analysis backup, not illustrative sample data"
        )
    raw = body.backup.get("plays")
    if not isinstance(raw, list):
        raise HTTPException(422, "Expected a CourtSense backup containing plays")
    selected = [
        p
        for p in raw
        if isinstance(p, dict)
        and str(p.get("mediaId", "")) == body.media_id
        and not p.get("sample")
    ]
    if not selected:
        raise HTTPException(422, "No saved plays for that source recording")
    if not body.confirm_mapping:
        raise HTTPException(
            422, "Confirm this backup belongs to the selected match video"
        )
    with engine.connect() as conn:
        match = one(conn, matches, i)
    if match["status"] not in ("ready", "needs_manual_review", "failed"):
        raise HTTPException(409, "Wait for analysis to finish")
    prepared = []
    for p in selected:
        try:
            a, b = float(p["start"]), float(p["end"])
            at = float(p.get("eventTime", a))
            if not 0 <= a < b <= match["duration_s"] + 0.05:
                raise ValueError("Play boundaries exceed this video's duration")
            b = min(b, match["duration_s"])
            d = Details(
                event_time=max(a, min(b, at)),
                confirmed=not p.get("suggested", False),
                position=p.get("position") or "Unassigned",
                action=p.get("action")
                or ("Set" if p.get("position") == "Setter" else "Unknown"),
                quality=p.get("quality") or "Unknown",
                destination=p.get("destination") or "Unknown",
                tempo=p.get("tempo") or "Unknown",
                placement=p.get("placement") or "Unknown",
                outcome=p.get("outcome") or "Unknown",
                mishit=bool(p.get("mishit")),
                incoming_pass=p.get("pass") or "Unknown",
                blockers=str(p.get("blockers") or "Unknown"),
                setter_zone=int(p["setterZone"]) if p.get("setterZone") else None,
            )
            pid = str(
                p.get("id")
                or hashlib.sha256(json.dumps(p, sort_keys=True).encode()).hexdigest()
            )
            prepared.append((p, pid, a, b, d))
        except (ValueError, KeyError, TypeError) as e:
            raise HTTPException(422, f"Invalid saved play: {e}")
    book = body.backup.get("matchBook") or {}
    roster = {
        str(p["id"]): p
        for p in book.get("roster", [])
        if isinstance(p, dict) and "id" in p
    }
    unknowns = {
        str(p["id"]): p
        for p in book.get("unknowns", [])
        if isinstance(p, dict) and "id" in p
    }
    added, skipped = [], []
    # One write transaction serializes duplicate imports and commits all metadata together.
    with engine.begin() as conn:
        conn.exec_driver_sql("UPDATE match SET id=id WHERE id=?", (i,))
        labels = {
            p["label"].casefold(): p["id"]
            for p in conn.execute(
                players.select().where(
                    players.c.match_id == i,
                    players.c.id.not_in(
                        identities.select().with_only_columns(identities.c.source_id)
                    ),
                )
            ).mappings()
        }
        catalog = {
            t["name"].casefold(): t["id"]
            for t in conn.execute(tags.select()).mappings()
        }
        for p, pid, a, b, d in prepared:
            key = (
                (imports.c.match_id == i)
                & (imports.c.media_id == body.media_id)
                & (imports.c.play_id == pid)
            )
            if conn.execute(imports.select().where(key)).first():
                skipped.append(pid)
                continue
            token = hashlib.sha256(f"{i}:{body.media_id}:{pid}".encode()).hexdigest()[
                :24
            ]
            directory = Path(match["path"]).parent / ("legacy-" + token)
            directory.mkdir(exist_ok=True)
            row = materialize(
                match["path"],
                directory,
                [dict(start_ts=a, end_ts=b, confidence=0.0, ball_presence_score=0.0)],
            )[0]
            cid = insert(conn, clips, match_id=i, notes=str(p.get("notes", "")), **row)
            u = unknowns.get(str(p.get("unknownId", "")), {})
            person = roster.get(str(u.get("personId") or p.get("rosterId") or ""), {})
            label = person.get("name") or p.get("player") or u.get("label")
            if label and label != "Unassigned":
                label = str(label)
                player = labels.get(label.casefold())
                if player is None:
                    player = insert(conn, players, match_id=i, label=label)
                    labels[label.casefold()] = player
                d.player_id = player
                conn.execute(
                    clipplayer.insert().values(
                        clip_id=cid, player_id=player, role=d.position
                    )
                )
            values = d.model_dump()
            explicit = {
                k: values.pop(k) for k in ("player_id", "event_time", "confirmed")
            }
            conn.execute(
                coaching.insert().values(
                    clip_id=cid, details=json.dumps(values), **explicit
                )
            )
            event_tags = p.get("eventKinds") or p.get("events") or []
            if not isinstance(event_tags, list):
                event_tags = []
            for label in dict.fromkeys([d.action, "Rally", *event_tags]):
                if not isinstance(label, str) or label in ("Unknown", ""):
                    continue
                if label.casefold() not in catalog:
                    catalog[label.casefold()] = insert(
                        conn, tags, name=label, color="#c2b5ff", builtin=False
                    )
                conn.execute(
                    cliptag.insert().values(
                        clip_id=cid, tag_id=catalog[label.casefold()]
                    )
                )
            conn.execute(
                imports.insert().values(
                    match_id=i,
                    media_id=body.media_id,
                    play_id=pid,
                    clip_id=cid,
                    original_json=json.dumps(p),
                )
            )
            added.append(cid)
        by_id = {
            str(g["id"]): g
            for g in book.get("games", [])
            if isinstance(g, dict) and "id" in g
        }
        for mark in (book.get("marks") or {}).get(body.media_id, []):
            g = by_id.get(str(mark.get("gameId")))
            if not g:
                continue
            at = float(mark["at"])
            if conn.execute(
                games.select().where(games.c.match_id == i, games.c.start_ts == at)
            ).first():
                continue
            try:
                body_game = GameIn(
                    name=g["name"],
                    number=g["number"],
                    stage=g.get("stage", "Pool play"),
                    start_ts=at,
                    url=g.get("url", ""),
                )
            except ValueError as e:
                raise HTTPException(422, f"Invalid saved game: {e}")
            put_game(conn, i, body_game)
    return {"imported": len(added), "skipped": len(skipped), "clip_ids": added}


@router.get("/matches/{i}/courtsense-backup")
def backup(i: int) -> dict[str, Any]:
    from .clips import list_clips

    with engine.connect() as conn:
        match = one(conn, matches, i)
        original = list(
            conn.execute(imports.select().where(imports.c.match_id == i)).mappings()
        )
    from .coaching import list_games, channel
    from .matches import roster

    return {
        "games": list_games(i),
        "players": roster(i),
        "channel": channel()["url"],
        "version": 2,
        "match": {k: v for k, v in match.items() if k != "path"},
        "clips": list_clips(i),
        "original_plays": [json.loads(p["original_json"]) for p in original],
    }
