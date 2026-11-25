from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean as B,
)
from sqlalchemy import (
    Column,
    MetaData,
    Table,
    Text,
)
from sqlalchemy import (
    Column as C,
)
from sqlalchemy import (
    Float as F,
)
from sqlalchemy import (
    ForeignKey as FK,
)
from sqlalchemy import (
    Integer as I,
)
from sqlalchemy import (
    String as S,
)

meta = MetaData()


def pk() -> Column:
    return C("id", I, primary_key=True)


def created() -> Column:
    return C("created_at", S, default=lambda: datetime.now(timezone.utc).isoformat())


matches = Table(
    "match",
    meta,
    pk(),
    C("filename", S),
    C("path", S),
    C("duration_s", F),
    C("fps", F),
    C("resolution", S),
    created(),
    C("status", S),
    C("error", Text),
    C("progress", I, default=0),
)
clips = Table(
    "clip",
    meta,
    pk(),
    C("match_id", FK("match.id"), index=True),
    C("start_ts", F),
    C("end_ts", F),
    C("duration_s", F),
    C("thumb_path", S),
    C("video_path", S),
    C("confidence", F),
    C("ball_presence_score", F),
    C("starred", B, default=False),
    C("flagged", B, default=False),
    C("notes", Text, default=""),
    C("deleted", B, default=False),
    created(),
)
tags = Table(
    "tag",
    meta,
    pk(),
    C("name", S(collation="NOCASE"), unique=True),
    C("color", S),
    C("hotkey", S, unique=True),
    C("builtin", B, default=False),
)
cliptag = Table(
    "clip_tag",
    meta,
    C("clip_id", FK("clip.id"), primary_key=True),
    C("tag_id", FK("tag.id"), primary_key=True),
)
players = Table(
    "player",
    meta,
    pk(),
    C("match_id", FK("match.id"), index=True),
    C("label", S),
    C("jersey_color", S),
    C("track_number", I),
)
clipplayer = Table(
    "clip_player",
    meta,
    C("clip_id", FK("clip.id"), primary_key=True),
    C("player_id", FK("player.id"), primary_key=True),
    C("role", S),
)
presets = Table(
    "filter_preset",
    meta,
    pk(),
    C("name", S, unique=True),
    C("json_query", Text),
    created(),
)
exports = Table(
    "export_job",
    meta,
    pk(),
    C("status", S),
    C("progress", I),
    C("output_path", S),
    C("error", Text),
    created(),
)
