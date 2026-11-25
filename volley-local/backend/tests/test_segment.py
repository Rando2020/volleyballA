import pytest

from backend.app.config import CONFIG
from backend.app.pipeline.segment import rallies


def frames(
    intervals: list[tuple[int, int]], still: bool = False, cls: int = 32
) -> list[dict]:
    result = []
    for i in range(120):
        x = 0.1 if still else 0.1 + i * 0.005
        objects = (
            [dict(cls=cls, id=1, box=[x, 0.2, x + 0.01, 0.21], conf=0.8)]
            if any(a <= i <= b for a, b in intervals)
            else []
        )
        result.append(dict(t=i / 8, objects=objects))
    return result


def test_absent_ball() -> None:
    assert rallies(frames([]), 15, CONFIG) == []


def test_people_motion() -> None:
    assert rallies(frames([(0, 119)], cls=0), 15, CONFIG) == []


def test_stationary_ball() -> None:
    assert rallies(frames([(0, 119)], still=True), 15, CONFIG) == []


def test_short_sighting() -> None:
    assert rallies(frames([(5, 8)]), 15, CONFIG) == []


def test_padding_clamped() -> None:
    (r,) = rallies(frames([(0, 119)]), 15, CONFIG)
    assert (r["start_ts"], r["end_ts"]) == (0, 15)
    assert r["confidence"] == pytest.approx(0.8)


def test_disappearance_splits_rallies() -> None:
    assert len(rallies(frames([(4, 17), (65, 86)]), 15, CONFIG)) == 2


def test_short_gap_merges_spans() -> None:
    assert (
        len(rallies(frames([(4, 17), (25, 42)]), 15, dict(CONFIG, end_gap_s=0.5))) == 1
    )
