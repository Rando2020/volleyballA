from __future__ import annotations

import argparse
import json
from pathlib import Path

from backend.app.config import CONFIG
from backend.app.pipeline import classify, detect, export, ingest, segment, track


def main() -> None:
    parser = argparse.ArgumentParser(description="Run one local analysis stage")
    parser.add_argument(
        "stage", choices=["ingest", "detect", "track", "segment", "classify", "export"]
    )
    parser.add_argument("work", type=Path)
    parser.add_argument("--video", type=Path)
    parser.add_argument("--start", type=float, default=0)
    parser.add_argument("--end", type=float)
    args = parser.parse_args()
    w = args.work.resolve()
    if args.stage in ("ingest", "export") and args.video is None:
        parser.error("--video is required")
    if args.stage == "ingest":
        info = ingest.probe(args.video)
        ingest.extract(args.video, w, CONFIG)
        (w / "metadata.json").write_text(json.dumps(info))
    elif args.stage == "detect":
        detect.detect(w, CONFIG)
    elif args.stage == "track":
        track.track(w, CONFIG)
    elif args.stage == "segment":
        segment.segment(
            w, json.loads((w / "metadata.json").read_text())["duration_s"], CONFIG
        )
    elif args.stage == "classify":
        output = classify.classify(w, json.loads((w / "rallies.json").read_text()))
        (w / "actions.json").write_text(json.dumps(output))
    else:
        w.mkdir(exist_ok=True, parents=True)
        export.cut(
            args.video,
            args.start,
            args.end or ingest.probe(args.video)["duration_s"],
            w / "clip.mp4",
        )


if __name__ == "__main__":
    main()
