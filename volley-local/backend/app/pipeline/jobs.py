from __future__ import annotations

import json
import subprocess
from bisect import bisect_left
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from backend.app.config import CLIPS, CONFIG, EXPORTS, THUMBS
from backend.app.db import (
    clips,
    cliptag,
    engine,
    exports,
    insert,
    matches,
    players,
    tags,
    update,
)
from backend.app.pipeline.classify import classify
from backend.app.pipeline.detect import detect
from backend.app.pipeline.export import cut, encode_for_reel, package, thumbnail
from backend.app.pipeline.ingest import extract
from backend.app.pipeline.segment import segment
from backend.app.pipeline.track import track

queue = ThreadPoolExecutor(max_workers=1, thread_name_prefix="balltime")


def error_message(e: Exception) -> str:
    if isinstance(e, subprocess.CalledProcessError):
        return (e.stderr or b"Media processing failed").decode(errors="replace")[-1200:]
    return str(e) or type(e).__name__


def materialize(
    path: str | Path, directory: Path, segments: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    rows = []
    archive = directory / "tracks.json"
    frames = json.loads(archive.read_text()) if archive.exists() else []
    stamps = [f["t"] for f in frames]
    clip_dir, thumb_dir = CLIPS / directory.name, THUMBS / directory.name
    for folder in (clip_dir, thumb_dir):
        folder.mkdir(exist_ok=True, parents=True)
    for i, segment in enumerate(segments):
        a, b = segment["start_ts"], segment["end_ts"]
        mp4, jpg = clip_dir / f"rally-{i + 1}.mp4", thumb_dir / f"rally-{i + 1}.jpg"
        mp4 = cut(path, a, b, mp4)
        thumbnail(mp4, min(0.4, (b - a) / 3), jpg)
        if frames:
            chunk = frames[bisect_left(stamps, a) : bisect_left(stamps, b)]
            mp4.with_suffix(".tracks.json").write_text(json.dumps(chunk))
        rows.append(
            dict(**segment, duration_s=b - a, video_path=str(mp4), thumb_path=str(jpg))
        )
    return rows


def analyze(key: int, path: str | Path, duration: float) -> None:
    directory = Path(path).parent
    try:
        from backend.app.config import WEIGHTS

        if not WEIGHTS.is_file():
            raise ValueError(
                f"Missing local detector weights: {WEIGHTS}. Add them and retry analysis."
            )
        from importlib.util import find_spec

        missing = [m for m in ("ultralytics", "supervision") if find_spec(m) is None]
        if missing:
            raise ValueError(
                "Install backend/requirements.txt in this Python environment and retry. Missing: "
                + ", ".join(missing)
            )
        work = directory
        (work / "analysis-config.json").write_text(json.dumps(CONFIG))
        for name, pct, fn in [
            ("extracting", 5, lambda: extract(path, work, CONFIG)),
            (
                "detecting",
                20,
                lambda: detect(
                    work,
                    CONFIG,
                    lambda pct: update(matches, key, progress=20 + int(0.4 * pct)),
                ),
            ),
            ("tracking", 60, lambda: track(work, CONFIG)),
        ]:
            update(matches, key, status=name, progress=pct)
            fn()
        update(matches, key, status="segmenting", progress=76)
        segments = segment(work, duration, CONFIG)
        actions = classify(work, segments)
        if actions:
            (directory / "actions.json").write_text(json.dumps(actions))
        update(matches, key, status="cutting", progress=85)
        rows = materialize(path, directory, segments)
        with engine.begin() as c:
            rally = (
                c.execute(tags.select().where(tags.c.name == "Rally"))
                .mappings()
                .one()["id"]
            )
            archived = json.loads((directory / "tracks.json").read_text())
            track_ids = sorted(
                {o["id"] for f in archived for o in f["objects"] if o["cls"] == 0}
            )
            known = set(
                c.execute(
                    players.select()
                    .with_only_columns(players.c.track_number)
                    .where(players.c.match_id == key)
                ).scalars()
            )
            for tid in set(track_ids) - known:
                insert(
                    c, players, match_id=key, label=f"Unknown P{tid}", track_number=tid
                )
            for row in rows:
                cid = insert(c, clips, match_id=key, **row)
                c.execute(cliptag.insert().values(clip_id=cid, tag_id=rally))
            c.execute(
                matches.update()
                .where(matches.c.id == key)
                .values(
                    status="ready" if segments else "needs_manual_review",
                    progress=100,
                    error=None,
                )
            )
    except Exception as e:
        update(matches, key, status="failed", error=error_message(e))


def export_job(
    key: int, rows: list[dict[str, Any]], mode: str, before: float, after: float
) -> None:
    try:
        directory = EXPORTS / str(key)
        directory.mkdir(parents=True, exist_ok=True)
        parts = []
        update(exports, key, status="running", progress=1)
        for row in rows:
            part = directory / f"clip-{row['id']}.mp4"
            cutter = encode_for_reel if mode == "reel" else cut
            part = cutter(
                row["path"],
                max(0, row["start_ts"] - before),
                min(row["match_duration"], row["end_ts"] + after),
                part,
            )
            parts.append(part)
            update(exports, key, progress=int(90 * len(parts) / len(rows)))
        (directory / "export.json").write_text(
            json.dumps(
                dict(
                    mode=mode, parts=[p.name for p in parts], before=before, after=after
                )
            )
        )
        result = package(directory, parts, mode)
        update(exports, key, status="ready", progress=100, output_path=str(result))
    except Exception as e:
        update(exports, key, status="failed", error=error_message(e))
