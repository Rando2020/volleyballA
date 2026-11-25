from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter

from backend.app.db import presets, tags

from .common import create, rows
from .schemas import Preset, TagIn

router = APIRouter()


@router.get("/tags")
def all_tags() -> list[dict[str, Any]]:
    return rows(tags.select().order_by(tags.c.id))


@router.post("/tags")
def new_tag(body: TagIn) -> dict[str, Any]:
    return create(tags, body.model_dump())


@router.get("/presets")
def all_presets() -> list[dict[str, Any]]:
    return [
        dict(r, json_query=json.loads(r["json_query"])) for r in rows(presets.select())
    ]


@router.post("/presets")
def new_preset(body: Preset) -> dict[str, Any]:
    return create(
        presets, dict(name=body.name, json_query=body.json_query.model_dump_json())
    )
