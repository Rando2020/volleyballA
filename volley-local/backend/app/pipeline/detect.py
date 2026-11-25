from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Callable

from backend.app.config import WEIGHTS


def detect(
    directory: Path, cfg: dict[str, Any], progress: Callable[[int], None] | None = None
) -> None:
    # Keep inference libraries, cache state and network restrictions in a child process.
    import subprocess
    import sys
    from collections import deque

    lines = deque(maxlen=10)
    args = [
        sys.executable,
        "-m",
        "backend.app.pipeline.detect",
        str(Path(directory).resolve()),
        json.dumps(cfg),
    ]
    with subprocess.Popen(
        args,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        errors="replace",
    ) as proc:
        for line in proc.stdout:
            if line.startswith("BALLTIME_PROGRESS "):
                if progress:
                    progress(int(line.split()[-1]))
            else:
                lines.append(line.rstrip())
        if proc.wait():
            raise RuntimeError("\n".join(lines)[-1500:] or "Local detector failed")


def predict(directory: Path, cfg: dict[str, Any]) -> None:
    if not WEIGHTS.is_file():
        raise FileNotFoundError(f"Place trusted local YOLOv8 COCO weights at {WEIGHTS}")
    from backend.app.pipeline.offline import local_yolo

    model = local_yolo(WEIGHTS)
    if any(
        model.names.get(i) != name for i, name in [(0, "person"), (32, "sports ball")]
    ):
        raise ValueError("Expected COCO person and sports ball classes")
    directory = Path(directory)
    frames = json.loads((directory / "frames.json").read_text())
    result = []
    batch = cfg["batch_size"]
    reported = -1
    for offset in range(0, len(frames), batch):
        group = frames[offset : offset + batch]
        predictions = model.predict(
            [f["path"] for f in group],
            imgsz=cfg.get("inference_size", 960),
            classes=[0, 32],
            conf=cfg["ball_confidence"],
            device=os.getenv("BALLTIME_DEVICE", "cpu"),
            verbose=False,
        )
        for frame, p in zip(group, predictions):
            result.append(
                dict(
                    t=frame["t"], shape=p.orig_shape, boxes=p.boxes.data.cpu().tolist()
                )
            )
        percent = int(100 * (offset + len(group)) / len(frames))
        if percent >= reported + 2 or percent == 100:
            print("BALLTIME_PROGRESS", percent, flush=True)
            reported = percent
    (directory / "detections.json").write_text(json.dumps(result))

    if cfg.get("ball_detector") == "vballnet":
        from backend.app.pipeline.vball import apply

        apply(directory)


if __name__ == "__main__":
    import sys

    predict(sys.argv[1], json.loads(sys.argv[2]))
