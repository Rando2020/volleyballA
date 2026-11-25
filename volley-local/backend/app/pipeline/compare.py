"""Compare saved-frame inference without changing the original analysis files."""

from __future__ import annotations

import argparse
import json
import shutil
import time
from pathlib import Path

from backend.app.config import CONFIG
from backend.app.pipeline.detect import detect
from backend.app.pipeline.segment import segment
from backend.app.pipeline.track import track
from backend.app.pipeline.vball import apply


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("work", type=Path)
    args = parser.parse_args()
    work = args.work.resolve()
    duration = json.loads((work / "metadata.json").read_text())["duration_s"]
    cfg = (
        json.loads((work / "analysis-config.json").read_text())
        if (work / "analysis-config.json").exists()
        else CONFIG
    )
    directory = work / "comparison"
    directory.mkdir(exist_ok=True)
    shutil.copyfile(work / "frames.json", directory / "frames.json")
    started = time.perf_counter()
    detect(directory, dict(cfg, ball_detector="yolo"))
    times = {"yolo": time.perf_counter() - started}
    original = directory / "detections-yolo.json"
    shutil.copyfile(directory / "detections.json", original)
    report = {}
    for name in ("yolo", "vballnet"):
        if name == "vballnet":
            started = time.perf_counter()
            apply(directory)
            times[name] = time.perf_counter() - started
        records = json.loads((directory / "detections.json").read_text())
        track(directory, cfg)
        rallies = segment(directory, duration, cfg)
        report[name] = dict(
            ball_frames=sum(any(int(b[5]) == 32 for b in f["boxes"]) for f in records),
            frames=len(records),
            rallies=rallies,
            inference_seconds=times[name],
        )
        shutil.copyfile(directory / "tracks.json", directory / f"tracks-{name}.json")
        shutil.copyfile(directory / "rallies.json", directory / f"rallies-{name}.json")
    (directory / "comparison.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
