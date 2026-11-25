from __future__ import annotations

from math import dist
from typing import Any


class BallAssociation:
    """Associate small, fast detections even when successive boxes have no overlap."""

    def __init__(self, fps: int, max_step: float) -> None:
        self.fps = fps
        self.max_step = max_step
        self.last = None
        self.velocity = (0.0, 0.0)
        self.number = 0

    def observe(
        self, rows: list[list[float]], width: int, height: int, t: float
    ) -> dict[str, Any] | None:
        candidates = []
        for x, y, r, b, score, _ in rows:
            box = [x / width, y / height, r / width, b / height]
            center = ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)
            candidates.append((float(score), center, box))
        if not candidates:
            return None
        gap = t - self.last[0] if self.last else 0.0
        if self.last and 0 < gap <= 2.1 / self.fps:
            old = self.last[1]
            predicted = tuple(v + gap * d for v, d in zip(old, self.velocity))
            viable = [c for c in candidates if dist(c[1], old) <= self.max_step]
            if not viable:
                return None
            score, center, box = min(
                viable, key=lambda c: dist(c[1], predicted) - 0.04 * c[0]
            )
            self.velocity = tuple((v - p) / gap for v, p in zip(center, old))
        else:
            score, center, box = max(candidates, key=lambda c: c[0])
            self.number += 1
            self.velocity = (0.0, 0.0)
        self.last = (t, center)
        return dict(cls=32, id=self.number, conf=score, box=box)
