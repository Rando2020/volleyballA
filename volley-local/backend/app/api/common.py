from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import Executable, Table
from sqlalchemy.engine import Connection
from sqlalchemy.exc import IntegrityError

from backend.app.db import clips, engine, insert


def one(c: Connection, table: Table, i: int) -> dict[str, Any]:
    query = table.select().where(table.c.id == i)
    if table is clips:
        query = query.where(clips.c.deleted == False)
    row = c.execute(query).mappings().first()
    if not row:
        raise HTTPException(404, "Record not found")
    return dict(row)


def rows(query: Executable) -> list[dict[str, Any]]:
    with engine.connect() as c:
        return [dict(r) for r in c.execute(query).mappings()]


def public(row: dict[str, Any]) -> dict[str, Any]:
    return {
        k: v
        for k, v in row.items()
        if k not in ("path", "video_path", "thumb_path", "output_path")
    }


def create(table: Table, values: dict[str, Any]) -> dict[str, Any]:
    try:
        with engine.begin() as c:
            return {"id": insert(c, table, **values)}
    except IntegrityError:
        raise HTTPException(409, "Name or shortcut already in use")
