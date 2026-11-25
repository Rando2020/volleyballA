from __future__ import annotations

from pathlib import Path

"""Deterministic coaching-board footage and ground-truth tracks for the demo match."""

import json
import math
import subprocess

from backend.app.config import FFMPEG

W, H, FPS = 640, 360, 24
HOME = [(263, 143), (150, 92), (267, 224), (89, 250), (158, 174), (78, 118)]
AWAY = [(369, 129), (472, 94), (378, 224), (539, 246), (477, 175), (551, 123)]
# Contact waypoints and apex lift for each incoming ball flight.
PLAY = [
    (0, 51, 250, 0),
    (1.3, 477, 175, 50),
    (2.2, 369, 129, 40),
    (3.1, 378, 224, 52),
    (4.1, 89, 250, 30),
    (5.0, 150, 92, 35),
    (6.1, 263, 143, 48),
    (7.2, 267, 224, 70),
    (8.3, 539, 246, 40),
    (9.2, 369, 129, 35),
    (10.3, 472, 94, 65),
    (11.4, 158, 174, 45),
    (12.4, 263, 143, 32),
    (13.5, 150, 92, 60),
    (14.5, 551, 123, 32),
    (15.6, 369, 129, 30),
    (16.7, 378, 224, 55),
    (18, 78, 118, 38),
]
DIGITS = (
    "111101101101111",
    "010110010010111",
    "111001111100111",
    "111001011001111",
    "101101111001001",
    "111100111001111",
    "111100111101111",
    "111001010010010",
    "111101111101111",
    "111101111001111",
)


def rect(
    buf: bytearray, x: int, y: int, w: int, h: int, color: tuple[int, int, int]
) -> None:
    row = bytes(color) * w
    for yy in range(y, y + h):
        start = 3 * (yy * W + x)
        buf[start : start + len(row)] = row


def circle(buf: bytearray, x: int, y: int, r: int, color: tuple[int, int, int]) -> None:
    for dy in range(-r, r + 1):
        dx = math.isqrt(r * r - dy * dy)
        rect(buf, x - dx, y + dy, 2 * dx + 1, 1, color)


def court() -> bytearray:
    buf = bytearray(bytes((32, 55, 66)) * (W * H))
    rect(buf, 46, 43, 548, 274, (235, 217, 186))
    rect(buf, 49, 46, 542, 268, (177, 126, 86))
    rect(buf, 229, 46, 182, 268, (190, 141, 99))
    for x in (228, 410):
        rect(buf, x, 46, 2, 268, (240, 220, 191))
    rect(buf, 319, 35, 3, 288, (242, 237, 225))
    for y in (33, 324):
        circle(buf, 320, y, 4, (153, 172, 183))
    for side, positions in enumerate((HOME, AWAY)):
        for i, (x, y) in enumerate(positions):
            circle(buf, x + 1, y + 2, 10, (109, 84, 68))
            circle(buf, x, y, 10, (232, 226, 214))
            circle(buf, x, y, 8, (91, 83, 175) if side == 0 else (42, 110, 116))
            for bit, value in enumerate(DIGITS[i + 1]):
                if value == "1":
                    rect(
                        buf,
                        x - 3 + 2 * (bit % 3),
                        y - 5 + 2 * (bit // 3),
                        2,
                        2,
                        (251, 248, 241),
                    )
    return buf


def make_demo(directory: Path) -> Path:
    path = directory / "court.mp4"
    base = court()
    frames = []
    people = [
        dict(
            cls=0,
            id=i + 1,
            conf=1.0,
            box=[(x - 10) / W, (y - 10) / H, (x + 10) / W, (y + 10) / H],
        )
        for i, (x, y) in enumerate(HOME + AWAY)
    ]
    args = [
        FFMPEG,
        "-v",
        "error",
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{W}x{H}",
        "-r",
        str(FPS),
        "-i",
        "pipe:0",
        "-c:v",
        "libx264",
        "-g",
        "24",
        "-bf",
        "0",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(path),
    ]
    segment = 1
    with subprocess.Popen(args, stdin=subprocess.PIPE) as proc:
        for i in range(18 * FPS):
            t = i / FPS
            while t > PLAY[segment][0]:
                segment += 1
            a, ax, ay, _ = PLAY[segment - 1]
            b, bx, by, lift = PLAY[segment]
            u = (t - a) / (b - a)
            x = round(ax + (bx - ax) * u)
            y = round(ay + (by - ay) * u - lift * 4 * u * (1 - u))
            frame = base.copy()
            circle(frame, x + 1, y + 2, 6, (97, 79, 69))
            circle(frame, x, y, 6, (254, 231, 127))
            circle(frame, x - 2, y - 2, 2, (255, 251, 223))
            proc.stdin.write(frame)
            if i % 3 == 0:
                ball = dict(
                    cls=32,
                    id=1,
                    conf=1.0,
                    box=[(x - 6) / W, (y - 6) / H, (x + 6) / W, (y + 6) / H],
                )
                frames.append(dict(t=t, objects=[*people, ball]))
        proc.stdin.close()
        if proc.wait():
            raise RuntimeError("FFmpeg could not generate demo footage")
    (directory / "tracks.json").write_text(json.dumps(frames))
    return path
