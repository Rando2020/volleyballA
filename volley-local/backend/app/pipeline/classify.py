from __future__ import annotations

from pathlib import Path
from typing import Any

"""Optional offline volleyball-action proposals for previously segmented rallies."""

import json
import os
from bisect import bisect_left
from pathlib import Path

from backend.app.config import ACTION_WEIGHTS, CONFIG, ROOT

LABELS = {
    "serve": "Serve",
    "service": "Serve",
    "serving": "Serve",
    "receive": "Pass",
    "reception": "Pass",
    "receiving": "Pass",
    "set": "Set",
    "setting": "Set",
    "spike": "Attack",
    "spiking": "Attack",
    "attack": "Attack",
    "block": "Block",
    "blocking": "Block",
}


def classify(directory: Path, clips: list[dict[str, Any]]) -> dict[str, Any]:
    import subprocess
    import sys

    directory = Path(directory)
    if (ACTION_WEIGHTS or "").strip():
        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "backend.app.pipeline.classify",
                str(directory.resolve()),
            ],
            input=json.dumps(clips),
            text=True,
            capture_output=True,
        )
        if completed.returncode:
            raise RuntimeError(
                completed.stderr[-1500:] or "Local action detector failed"
            )
        return json.loads((directory / "action-suggestions.json").read_text())
    return propose(directory, clips)


def propose(directory: Path, clips: list[dict[str, Any]]) -> dict[str, Any]:
    directory = Path(directory)
    configured = (ACTION_WEIGHTS or "").strip()
    report = {"status": "disabled", "samples": [], "model": None}
    if os.getenv("BALLTIME_POSE", "0") == "1":
        report["pose_actions"] = ["unknown" for _ in clips]
    if configured:
        weights = (ROOT / configured).resolve()
        if not weights.is_file() or weights.suffix.lower() != ".pt":
            raise ValueError(f"Expected a local YOLO action checkpoint at {weights}")
        from backend.app.pipeline.offline import local_yolo

        model = local_yolo(weights)
        names = model.names
        labels = {
            i: LABELS[name.strip().lower()]
            for i, name in names.items()
            if name.strip().lower() in LABELS
        }
        if not labels:
            raise ValueError(
                f"No recognized volleyball actions in checkpoint classes: {names}"
            )
        frames = json.loads((directory / "frames.json").read_text())
        times = [frame["t"] for frame in frames]
        batch = CONFIG["batch_size"]
        report.update(status="complete", model=weights.name)
        for index, clip in enumerate(clips):
            start = bisect_left(times, clip["start_ts"])
            end = bisect_left(times, clip["end_ts"])
            for offset in range(start, end, batch):
                group = frames[offset : min(offset + batch, end)]
                results = model.predict(
                    [frame["path"] for frame in group],
                    classes=list(labels),
                    conf=CONFIG.get("action_confidence", 0.5),
                    device=os.getenv("BALLTIME_DEVICE", "cpu"),
                    verbose=False,
                )
                for frame, result in zip(group, results, strict=True):
                    for cls, conf, box in zip(
                        result.boxes.cls.tolist(),
                        result.boxes.conf.tolist(),
                        result.boxes.xyxyn.tolist(),
                        strict=True,
                    ):
                        report["samples"].append(
                            dict(
                                rally=index + 1,
                                start_ts=clip["start_ts"],
                                t=frame["t"],
                                action=labels[int(cls)],
                                confidence=conf,
                                box=box,
                            )
                        )
    (directory / "action-suggestions.json").write_text(json.dumps(report))
    return report


if __name__ == "__main__":
    import sys

    propose(Path(sys.argv[1]), json.load(sys.stdin))
