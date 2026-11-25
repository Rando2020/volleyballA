from __future__ import annotations

from collections import Counter
from typing import Any

from fastapi import APIRouter

from .clips import list_clips
from .matches import roster

router = APIRouter()


@router.get("/matches/{i}/stats")
def stats(i: int) -> dict[str, Any]:
    items = list_clips(i)
    by_tag = Counter(t for clip in items for t in clip["tags"])
    by_player = {p["id"]: Counter() for p in roster(i)}
    for clip in items:
        for p in clip["players"]:
            by_player[p["player_id"]].update(clip["tags"])
    return dict(total=len(items), by_tag=by_tag, by_player=by_player)
