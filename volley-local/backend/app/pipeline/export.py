from __future__ import annotations

import json
from pathlib import Path
from zipfile import ZipFile

from backend.app.pipeline.ingest import run


def cut(source: str | Path, start: float, end: float, target: Path) -> Path:
    """Copy compressed packets; MP4 edit lists preserve seek preroll for decoding."""
    if start < 0 or end <= start:
        raise ValueError("Clip bounds must have a nonnegative start and a later end")
    target = Path(target)
    args = (
        "ffmpeg",
        "-v",
        "error",
        "-y",
        "-ss",
        start,
        "-i",
        source,
        "-t",
        max(0.001, end - start),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c",
        "copy",
    )
    from subprocess import CalledProcessError

    try:
        run(*args, "-use_editlist", "1", "-movflags", "+faststart", target)
    except CalledProcessError:
        target.unlink(missing_ok=True)
        target = target.with_suffix(".mkv")
        run(*args, target)
    target.with_suffix(".cut.json").write_text(
        json.dumps(
            dict(
                source=str(source),
                start_ts=start,
                end_ts=end,
                path=str(target),
                codec_mode="copy",
            )
        )
    )
    return target


def encode_for_reel(source: str | Path, start: float, end: float, target: Path) -> Path:
    run(
        "ffmpeg",
        "-v",
        "error",
        "-y",
        "-ss",
        start,
        "-i",
        source,
        "-t",
        max(0.04, end - start),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        "pad=ceil(iw/2)*2:ceil(ih/2)*2",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        target,
    )

    return target


def thumbnail(source: str | Path, at: float, target: Path) -> None:
    run(
        "ffmpeg",
        "-v",
        "error",
        "-y",
        "-ss",
        at,
        "-i",
        source,
        "-frames:v",
        "1",
        "-vf",
        "scale=240:-2",
        target,
    )


def package(directory: Path, parts: list[Path], mode: str) -> Path:
    if len(parts) == 1:
        return parts[0]
    if mode == "individual":
        path = directory / "clips.zip"
        with ZipFile(path, "w") as archive:
            for p in parts:
                archive.write(p, p.name)
        return path
    manifest = directory / "parts.txt"
    manifest.write_text("".join(f"file '{p.name}'\n" for p in parts))
    path = directory / "highlights.mp4"
    run(
        "ffmpeg",
        "-v",
        "error",
        "-y",
        "-f",
        "concat",
        "-safe",
        "1",
        "-i",
        manifest.name,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        path.name,
        cwd=directory,
    )
    return path
