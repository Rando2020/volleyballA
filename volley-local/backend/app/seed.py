from __future__ import annotations

from backend.app.config import UPLOADS
from backend.app.db import (
    clipplayer,
    clips,
    cliptag,
    engine,
    exports,
    insert,
    matches,
    meta,
    players,
    tags,
)
from backend.app.pipeline.jobs import materialize
from backend.app.utils.demo import make_demo

BUILTINS = [
    ("Serve", "#a5d5ff"),
    ("Spike", "#ffb0a8"),
    ("Block", "#c2b5ff"),
    ("Dig", "#8ddfc8"),
    ("Set", "#ffda96"),
    ("Rally", "#aab9d2"),
    ("Error", "#ffa8bf"),
    ("Highlight", "#e1b4fd"),
    ("Ace", "#c6df84"),
    ("Serve in", "#98cc9a"),
    ("Serve error", "#ffa0a0"),
    ("Pass", "#9adbea"),
    ("Kill", "#f3c281"),
]


def recover_interrupted_jobs() -> None:
    with engine.begin() as c:
        c.execute(
            matches.update()
            .where(matches.c.status.not_in(["ready", "failed", "needs_manual_review"]))
            .values(status="failed", error="Analysis interrupted. Retry to resume.")
        )
        c.execute(
            exports.update()
            .where(exports.c.status.in_(["queued", "running"]))
            .values(status="failed", error="Export interrupted. Start another export.")
        )


def seed() -> None:
    meta.create_all(engine)
    with engine.begin() as c:
        if c.execute(tags.select()).first() is None:
            for i, (name, color) in enumerate(BUILTINS):
                insert(
                    c,
                    tags,
                    name=name,
                    color=color,
                    hotkey=str(i + 1) if i < 8 else None,
                    builtin=True,
                )
        if c.execute(matches.select()).first():
            return
        directory = UPLOADS / "demo"
        directory.mkdir(exist_ok=True)
        path = make_demo(directory)
        mid = insert(
            c,
            matches,
            filename="Practice court · Demo",
            path=str(path),
            duration_s=18,
            fps=24,
            resolution="640x360",
            status="ready",
            progress=100,
        )
        player = insert(
            c, players, match_id=mid, label="Unknown 1", jersey_color="Blue"
        )
        ts = {r.name: r.id for r in c.execute(tags.select())}
        import random

        rng = random.Random(51)
        segments = []
        for i in range(10):
            start = round(i * 1.8, 2)
            segments.append(
                dict(
                    start_ts=start,
                    end_ts=start + 1.6,
                    confidence=round(rng.uniform(0.66, 0.96), 2),
                    ball_presence_score=0.98,
                )
            )
        for i, row in enumerate(materialize(path, directory, segments)):
            action = rng.choice(["Serve", "Set", "Dig", "Pass", "Spike", "Block"])
            cid = insert(
                c,
                clips,
                match_id=mid,
                **row,
                notes=f"Demo rally {i + 1}: {action.lower()}",
                starred=i % 4 == 0,
            )
            for name in (action, "Rally"):
                c.execute(cliptag.insert().values(clip_id=cid, tag_id=ts[name]))
            if action == "Set" or i == 1:
                c.execute(
                    clipplayer.insert().values(
                        clip_id=cid, player_id=player, role="Setter"
                    )
                )


if __name__ == "__main__":
    seed()
