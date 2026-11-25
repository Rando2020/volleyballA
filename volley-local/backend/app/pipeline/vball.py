"""Port of CourtSense's VballNetFastV1 nine-frame grayscale inference adapter."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from backend.app.config import ROOT, paths


def decode(heat: np.ndarray) -> tuple[float, float, float] | None:
    height, width = heat.shape
    index = int(heat.argmax())
    peak = float(heat.flat[index])
    if peak < 0.55:
        return None
    py, px = divmod(index, width)
    ys, xs = np.nonzero(heat >= peak * 0.68)
    near = (abs(xs - px) <= 10) & (abs(ys - py) <= 10)
    if np.any(heat[ys[~near], xs[~near]] > peak * 0.9):
        return None
    xs, ys = xs[near], ys[near]
    scores = heat[ys, xs]
    total = float(scores.sum())
    if total <= 0:
        return None
    return (
        float(((xs + 0.5) * scores).sum() / total / width),
        float(((ys + 0.5) * scores).sum() / total / height),
        peak,
    )


def apply(directory: Path) -> None:
    import cv2
    import onnxruntime as ort

    weights = ROOT / paths.get("volleyball_weights", "models/vballnet.onnx")
    if not weights.is_file():
        raise ValueError(f"Missing local volleyball weights: {weights}")
    options = ort.SessionOptions()
    options.enable_profiling = False
    options.intra_op_num_threads = 4
    session = ort.InferenceSession(
        str(weights), sess_options=options, providers=["CPUExecutionProvider"]
    )
    frames = json.loads((directory / "frames.json").read_text())
    detections = json.loads((directory / "detections.json").read_text())
    (directory / "detections-yolo.json").write_text(json.dumps(detections))
    for offset in range(0, len(frames), 9):
        group = frames[offset : offset + 9]
        batch = []
        for frame in group:
            bgr = cv2.imread(frame["path"])
            if bgr is None:
                raise ValueError("Missing sampled frame. Re-run ingest.")
            rgb = cv2.cvtColor(cv2.resize(bgr, (512, 288)), cv2.COLOR_BGR2RGB).astype(
                np.float32
            )
            batch.append(
                (rgb[:, :, 0] * 0.299 + rgb[:, :, 1] * 0.587 + rgb[:, :, 2] * 0.114)
                / 255.0
            )
        while len(batch) < 9:
            batch.append(batch[-1])
        out = session.run(None, {session.get_inputs()[0].name: np.stack(batch)[None]})[
            0
        ]
        if out.ndim != 4 or out.shape[0:2] != (1, 9):
            raise ValueError("Unexpected volleyball model output")
        for j, _ in enumerate(group):
            record = detections[offset + j]
            record["boxes"] = [b for b in record["boxes"] if int(b[5]) == 0]
            ball = decode(out[0, j])
            if ball:
                x, y, score = ball
                h, w = record["shape"]
                radius = 4
                record["boxes"].append(
                    [
                        max(0, x * w - radius),
                        max(0, y * h - radius),
                        min(w, x * w + radius),
                        min(h, y * h + radius),
                        score,
                        32,
                    ]
                )
    (directory / "detections-vballnet.json").write_text(json.dumps(detections))
    (directory / "detections.json").write_text(json.dumps(detections))
