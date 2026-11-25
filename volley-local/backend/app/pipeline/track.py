from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from backend.app.pipeline.ball import BallAssociation


def track(directory: Path, cfg: dict[str, Any]) -> None:
    import numpy as np
    import supervision as sv

    directory = Path(directory)
    people = sv.ByteTrack(frame_rate=cfg["target_fps"], track_activation_threshold=0.28)
    ball = BallAssociation(cfg["target_fps"], cfg["max_step"])
    output = []
    for frame in json.loads((directory / "detections.json").read_text()):
        objects = []
        h, w = frame["shape"]
        rows = np.array(
            [b for b in frame["boxes"] if int(b[5]) == 0], dtype=float
        ).reshape(-1, 6)
        detections = sv.Detections(
            xyxy=rows[:, :4], confidence=rows[:, 4], class_id=rows[:, 5].astype(int)
        )
        for box, _, conf, _, track_id, _ in people.update_with_detections(detections):
            objects.append(
                dict(
                    cls=0,
                    id=int(track_id),
                    box=(box / [w, h, w, h]).tolist(),
                    conf=float(conf),
                )
            )
        observation = ball.observe(
            [b for b in frame["boxes"] if int(b[5]) == 32], w, h, frame["t"]
        )
        if observation:
            objects.append(observation)
        output.append(dict(t=frame["t"], objects=objects))
    (directory / "tracks.json").write_text(json.dumps(output))
