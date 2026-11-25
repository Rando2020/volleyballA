"""Opt-in smoke test using the photograph distributed with the installed detector."""

import importlib.util
import os
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.mark.skipif(
    os.getenv("VOLLEY_TEST_CV") != "1", reason="opt-in local model inference"
)
def test_people_pan_needs_manual_review(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from backend.app import config
    from backend.app.main import app
    from backend.app.pipeline.ingest import run

    weights = config.ROOT / "models" / "yolov8n.pt"
    monkeypatch.setenv("BALLTIME_WEIGHTS", str(weights))
    monkeypatch.setattr(config, "WEIGHTS", weights)
    spec = importlib.util.find_spec("ultralytics")
    assert spec and spec.origin
    photo = Path(spec.origin).parent / "assets" / "bus.jpg"
    video = tmp_path / "pan.mp4"
    run(
        "ffmpeg",
        "-v",
        "error",
        "-y",
        "-loop",
        "1",
        "-i",
        photo,
        "-t",
        2,
        "-vf",
        "crop=580:780:x='40*t':y=140,scale=480:-2",
        "-r",
        12,
        "-pix_fmt",
        "yuv420p",
        video,
    )
    with TestClient(app) as client:
        with video.open("rb") as f:
            mid = client.post("/matches", files={"file": ("pan.mp4", f)}).json()[
                "match_id"
            ]
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            match = client.get(f"/matches/{mid}").json()
            if match["status"] in ("needs_manual_review", "ready", "failed"):
                break
            time.sleep(0.5)
        assert match["status"] == "needs_manual_review", match
        assert client.get(f"/matches/{mid}/players").json()
        assert client.get(f"/matches/{mid}/clips").json() == []
        assert (
            client.get(
                f"/matches/{mid}/video", headers={"range": "bytes=0-15"}
            ).status_code
            == 206
        )
