from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ultralytics import YOLO
import os

from backend.app.config import DATA


def local_yolo(weights: Path) -> YOLO:
    os.environ.update(
        YOLO_OFFLINE="true",
        YOLO_AUTOINSTALL="false",
        YOLO_CONFIG_DIR=str(DATA / "ultralytics"),
        DO_NOT_TRACK="1",
    )
    import sys

    def offline(event: str, args: tuple[Any, ...]) -> None:
        if event in ("socket.connect", "socket.getaddrinfo", "socket.sendto"):
            raise OSError("Detector runs offline")

    sys.addaudithook(offline)
    from ultralytics import YOLO, settings

    settings.update({"sync": False, "hub": False})
    return YOLO(str(weights))
