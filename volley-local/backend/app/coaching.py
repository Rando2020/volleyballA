"""CourtSense coaching records and match organization, stored in the local database."""

from __future__ import annotations

import json
from collections import Counter
from typing import Any
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, String, Table, Text

from backend.app.db import meta

games = Table(
    "game",
    meta,
    Column("id", Integer, primary_key=True),
    Column("match_id", ForeignKey("match.id"), index=True),
    Column("name", String),
    Column("number", Integer),
    Column("stage", String),
    Column("start_ts", Float),
    Column("url", String),
)
coaching = Table(
    "coaching",
    meta,
    Column("clip_id", ForeignKey("clip.id"), primary_key=True),
    Column("player_id", ForeignKey("player.id"), nullable=True),
    Column("event_time", Float),
    Column("confirmed", Boolean, default=False),
    Column("details", Text),
)
settings = Table(
    "studio_setting",
    meta,
    Column("key", String, primary_key=True),
    Column("value", Text),
)
imports = Table(
    "legacy_import",
    meta,
    Column("match_id", ForeignKey("match.id"), primary_key=True),
    Column("media_id", String, primary_key=True),
    Column("play_id", String, primary_key=True),
    Column("clip_id", ForeignKey("clip.id")),
    Column("original_json", Text),
)
identities = Table(
    "player_identity",
    meta,
    Column("source_id", ForeignKey("player.id"), primary_key=True),
    Column("target_id", ForeignKey("player.id")),
)


class Details(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    player_id: int | None = None
    event_time: float = Field(ge=0)
    confirmed: bool = False
    position: str = "Unassigned"
    action: str = "Unknown"
    quality: str = "Unknown"
    destination: str = "Unknown"
    tempo: str = "Unknown"
    placement: str = "Unknown"
    outcome: str = "Unknown"
    mishit: bool = False
    incoming_pass: str = "Unknown"
    blockers: str = "Unknown"
    setter_zone: int | None = Field(None, ge=1, le=6)

    @field_validator(
        "position",
        "action",
        "quality",
        "destination",
        "tempo",
        "placement",
        "outcome",
        "incoming_pass",
        "blockers",
    )
    @classmethod
    def short_value(cls, value: str) -> str:
        if len(value) > 100:
            raise ValueError("Use a label under 100 characters")
        return value


class GameIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    number: int = Field(ge=1, le=999)
    stage: str = Field(default="Pool play", max_length=40)
    start_ts: float = Field(ge=0)
    url: str = ""

    @field_validator("url")
    @classmethod
    def link(cls, value: str) -> str:
        return youtube(value)


def youtube(value: str) -> str:
    if not value:
        return ""
    parsed = urlsplit(value)
    if parsed.scheme != "https" or parsed.hostname not in {
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "youtu.be",
    }:
        raise ValueError("Use an HTTPS YouTube link")
    return value


def record(row: dict[str, Any], start: float) -> dict[str, Any]:
    return (
        {
            **json.loads(row["details"]),
            **{k: row[k] for k in ("player_id", "event_time", "confirmed")},
        }
        if row
        else Details(event_time=start).model_dump()
    )


def game_at(book: list[dict[str, Any]], at: float) -> int | None:
    before = [g for g in book if g["start_ts"] <= at]
    return max(before, key=lambda g: g["start_ts"])["id"] if before else None


def summarize(items: list[dict[str, Any]]) -> dict[str, Any]:
    confirmed = [c for c in items if c["coaching"]["confirmed"]]
    setters = [c for c in confirmed if c["coaching"]["position"] == "Setter"]
    outcomes = {
        "Kill",
        "Dug by opponent",
        "Blocked back",
        "Blocked for point",
        "Attack error",
    }
    qualities = {"In rhythm", "Hittable with adjustment", "Unattackable"}
    known = [c for c in setters if c["coaching"]["outcome"] in outcomes]
    graded = [c for c in setters if c["coaching"]["quality"] in qualities]
    bins: dict[str, list[int]] = {}
    for clip in confirmed:
        bins.setdefault(clip["coaching"]["outcome"], []).append(clip["id"])
    return dict(
        confirmed=len(confirmed),
        unconfirmed=len(items) - len(confirmed),
        kill_rate=dict(
            numerator=sum(c["coaching"]["outcome"] == "Kill" for c in known),
            denominator=len(known),
        ),
        hittable_sets=dict(
            numerator=sum(
                c["coaching"]["quality"] in {"In rhythm", "Hittable with adjustment"}
                for c in graded
            ),
            denominator=len(graded),
        ),
        outcomes=bins,
        serve_results=dict(
            Counter(
                c["coaching"]["outcome"]
                for c in confirmed
                if c["coaching"]["action"] == "Serve"
            )
        ),
        mishits=sum(c["coaching"]["mishit"] for c in confirmed),
    )
