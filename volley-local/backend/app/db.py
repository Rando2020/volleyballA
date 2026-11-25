from __future__ import annotations

import sqlite3
from typing import Any

from sqlalchemy import Table, create_engine, event
from sqlalchemy.engine import Connection

from .config import DB_FILE
from .models import (
    clipplayer,
    clips,
    cliptag,
    exports,
    matches,
    meta,
    players,
    presets,
    tags,
)

engine = create_engine(
    "sqlite:///" + DB_FILE.as_posix(),
    connect_args={"check_same_thread": False, "timeout": 30},
)


@event.listens_for(engine, "connect")
def configure(conn: sqlite3.Connection, _: object) -> None:
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")


def insert(conn: Connection, table: Table, **values: Any) -> int:
    return conn.execute(table.insert().values(**values)).inserted_primary_key[0]


def update(table: Table, key: int, **values: Any) -> None:
    with engine.begin() as conn:
        conn.execute(table.update().where(table.c.id == key).values(**values))


__all__ = [
    "meta",
    "matches",
    "clips",
    "tags",
    "players",
    "cliptag",
    "clipplayer",
    "presets",
    "exports",
    "engine",
    "insert",
    "update",
]
