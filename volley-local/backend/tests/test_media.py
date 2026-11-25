import json
from pathlib import Path
import pytest
from backend.app.pipeline.export import cut
from backend.app.pipeline.ingest import run, probe
from backend.app.config import UPLOADS
from backend.app.seed import seed


def test_copy_cut_preserves_first_visible_frame(tmp_path: Path) -> None:
    seed()
    source = UPLOADS / "demo" / "court.mp4"
    start = 0.375
    result = cut(source, start, start + 1, tmp_path / "sample.mp4")

    def first_frame(path: Path, at: float) -> bytes:
        return run(
            "ffmpeg",
            "-v",
            "error",
            "-ss",
            at,
            "-i",
            path,
            "-map",
            "0:v:0",
            "-frames:v",
            "1",
            "-f",
            "md5",
            "pipe:1",
        ).stdout

    assert first_frame(source, start) == first_frame(result, 0)
    assert probe(result)["duration_s"] == pytest.approx(1, abs=0.05)
    assert (
        json.loads(result.with_suffix(".cut.json").read_text())["codec_mode"] == "copy"
    )
