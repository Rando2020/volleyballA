from __future__ import annotations

import json
from collections import deque
from math import dist
from pathlib import Path
from typing import Any


def rallies(
    frames: list[dict[str, Any]], duration: float, cfg: dict[str, Any]
) -> list[dict[str, Any]]:
    """Confirm sustained motion inside a recent window. Use only associated ball centers."""
    window = deque()
    spans = []
    start = last = previous = None
    dt = 1 / cfg["target_fps"]
    seen = []
    for frame in frames:
        t = frame["t"]
        if last is not None and t - last + 1e-8 >= cfg["end_gap_s"]:
            if start is not None:
                spans.append((start, last + dt))
            start = previous = last = None
            window.clear()
        balls = [o for o in frame["objects"] if o["cls"] == 32]
        if not balls:
            continue
        ball = max(
            balls,
            key=lambda o: (previous is not None and o["id"] == previous[2], o["conf"]),
        )
        x, y, r, b = ball["box"]
        center = ((x + r) / 2, (y + b) / 2)
        seen.append((t, ball["conf"]))
        if previous:
            pt, pc, pid = previous
            if pid != ball["id"] and start is None:
                window.clear()
            step = dist(center, pc)
            if (
                pid == ball["id"]
                and t - pt <= 2.1 * dt
                and cfg["motion_threshold"] <= step <= cfg["max_step"]
            ):
                window.append((pt, t))
        while window and t - window[0][0] > cfg["movement_window_s"]:
            window.popleft()
        if (
            start is None
            and sum(b - a for a, b in window) + 1e-8 >= cfg["min_motion_s"]
        ):
            start = window[0][0]
        previous = (t, center, ball["id"])
        last = t
    if start is not None:
        spans.append((start, min(duration, last + dt)))
    merged = []
    for a, b in spans:
        if merged and a - merged[-1][1] < cfg["merge_gap_s"]:
            merged[-1] = (merged[-1][0], b)
        else:
            merged.append((a, b))
    output = []
    from bisect import bisect_left

    times = [t for t, _ in seen]
    for a, b in merged:
        values = seen[bisect_left(times, a) : bisect_left(times, b)]
        score = min(1, len(values) * dt / max(dt, b - a))
        output.append(
            dict(
                start_ts=max(0, a - cfg["pre_roll_s"]),
                end_ts=min(duration, b + cfg["post_roll_s"]),
                ball_presence_score=score,
                confidence=score * sum(v for _, v in values) / max(1, len(values)),
            )
        )
    return output


def segment(
    directory: Path, duration: float, cfg: dict[str, Any]
) -> list[dict[str, Any]]:
    directory = Path(directory)
    clips = rallies(json.loads((directory / "tracks.json").read_text()), duration, cfg)
    (directory / "rallies.json").write_text(json.dumps(clips))
    return clips
