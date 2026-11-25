from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

from backend.app.config import FFMPEG, FFPROBE


def run(
    *args: str | Path | int | float, cwd: Path | None = None
) -> subprocess.CompletedProcess[bytes]:
    if str(args[0]) in ("ffmpeg", "ffprobe"):
        args = (
            FFMPEG if args[0] == "ffmpeg" else FFPROBE,
            "-protocol_whitelist",
            "file,pipe",
            *args[1:],
        )
    return subprocess.run(
        [str(a) for a in args], check=True, capture_output=True, cwd=cwd
    )


def probe(path: str | Path) -> dict[str, Any]:
    raw = json.loads(
        run(
            "ffprobe",
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            path,
        ).stdout
    )
    stream = next(
        s
        for s in raw["streams"]
        if s["codec_type"] == "video"
        and not s.get("disposition", {}).get("attached_pic")
    )
    n, d = stream["avg_frame_rate"].split("/")
    duration = float(stream.get("duration") or raw["format"]["duration"])
    if not 0 < duration < float("inf"):
        raise ValueError("Invalid video duration")
    return dict(
        duration_s=duration,
        fps=int(n) / max(1, int(d)),
        resolution=f"{stream['width']}x{stream['height']}",
    )


def extract(
    path: str | Path, directory: Path, cfg: dict[str, Any]
) -> list[dict[str, Any]]:
    directory = Path(directory)
    frames = directory / "frames"
    frames.mkdir(exist_ok=True, parents=True)
    if any(frames.iterdir()):
        from tempfile import mkdtemp

        frames = Path(mkdtemp(prefix="frames-", dir=directory))
    run(
        "ffmpeg",
        "-loglevel",
        "error",
        "-y",
        "-i",
        path,
        "-vf",
        f"fps={cfg['target_fps']},scale={cfg['frame_width']}:-2",
        "-q:v",
        "4",
        frames / "%08d.jpg",
    )
    files = sorted(frames.glob("[0-9]" * 8 + ".jpg"))
    if not files:
        raise ValueError("Video has no decodable frames")
    manifest = [
        dict(t=i / cfg["target_fps"], path=str(p.resolve()))
        for i, p in enumerate(files)
    ]
    (directory / "frames.json").write_text(json.dumps(manifest))
    return manifest
