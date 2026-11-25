from __future__ import annotations

import os
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
raw = yaml.safe_load((ROOT / "config.yaml").read_text())
paths = raw.pop("paths")
DATA = (ROOT / os.getenv("BALLTIME_DATA", paths["data"])).resolve()
DB_FILE = DATA / paths["database"]
UPLOADS, CLIPS, THUMBS, EXPORTS = (
    DATA / paths[k] for k in ("uploads", "clips", "thumbs", "exports")
)
for directory in (DB_FILE.parent, UPLOADS, CLIPS, THUMBS, EXPORTS):
    directory.mkdir(parents=True, exist_ok=True)
WEIGHTS = (ROOT / os.getenv("BALLTIME_WEIGHTS", paths["weights"])).resolve()
ACTION_WEIGHTS = os.getenv("BALLTIME_ACTION_WEIGHTS") or paths.get("action_weights")
DIST = ROOT / paths["frontend"]
FFMPEG = paths["ffmpeg"]
FFPROBE = paths["ffprobe"]
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AnalysisSettings(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    ball_detector: Literal["yolo", "vballnet"] = "yolo"
    target_fps: int = Field(gt=0, le=240)
    frame_width: int = Field(ge=32)
    inference_size: int = Field(960, ge=32)
    movement_window_s: float = Field(gt=0)
    min_motion_s: float = Field(gt=0)
    motion_threshold: float = Field(gt=0)
    max_step: float = Field(gt=0)
    end_gap_s: float = Field(gt=0)
    merge_gap_s: float = Field(ge=0)
    pre_roll_s: float = Field(ge=0)
    post_roll_s: float = Field(ge=0)
    ball_confidence: float = Field(gt=0, le=1)
    action_confidence: float = Field(0.5, gt=0, le=1)
    batch_size: int = Field(ge=1)

    @model_validator(mode="after")
    def check_movement(self) -> AnalysisSettings:
        if (
            self.min_motion_s > self.movement_window_s
            or self.motion_threshold > self.max_step
        ):
            raise ValueError(
                "Motion thresholds must fit within the configured observation window and maximum step"
            )
        return self


CONFIG = AnalysisSettings.model_validate(raw).model_dump()
