# CourtSense Local

A single-user volleyball film room for your computer. Upload a match, review rallies beside the video, assign players and tags, filter the filmstrip, and export selected plays. The release includes YOLOv8n weights and a compiled frontend. First launch seeds ten playable synthetic clips with reproducible random tags. No video upload leaves the loopback interface.

## Combined CourtSense workflow

The studio includes CourtSense contact grading, setter quality/tempo/placement/destination, attack outcomes, mishits, incoming pass quality, blocker count, and manually assigned 5-1 setter zones. Choose the contact player and confirm the record to include it in coaching rates. Click an outcome count to show its underlying clips. Unknown outcomes and ungraded quality are excluded from the relevant denominator. One coaching contact is recorded per clip.

Expand Games and YouTube bookmarks to mark game starts in seconds, edit boundaries, assign pool/bracket stages, and save game/channel links. Game assignment follows each clip's contact time. Linking an unknown player to a known player updates all earlier contact records and player assignments. Match-local tracking may still fragment identities.

To import the earlier browser CourtSense, export its analysis JSON and upload the corresponding original recording into this studio. Expand Import earlier CourtSense analysis, select the backup's recording, and confirm it matches the selected local video. Existing saved plays, notes, tags, contact fields, roster names, and game boundaries are imported. Repeating that import skips the same play IDs. Original play records, including hand-drawn trajectory points, remain in the downloadable coaching backup. Historical hand-drawn traces remain metadata; automatic tracks power the live overlay. Videos stored in the earlier browser's IndexedDB must be supplied as local files.

## Local ball-detector comparison

The prior CourtSense VballNetFastV1 ONNX model and license are included locally. Select ball_detector: vballnet and target_fps: 25 in config.yaml before new analysis to use it for the ball; YOLO still supplies person detections. The default remains yolo while real-game accuracy is unmeasured.

After ingest, compare both detectors on exactly the same retained frames:

```sh
python -m backend.app.pipeline.compare data/uploads/MATCH_FOLDER
```

The comparison folder contains both detections, tracks, rally boundaries, and a JSON report. On a two-second moving crop of a photograph with people and no ball, both detectors produced zero rallies across 50 sampled frames. This verifies the local execution path. Detector precision, recall and full-game latency require representative labeled volleyball footage. The reported YOLO timing includes person detection and process startup, while VballNet timing covers the additional ball pass, so these figures are not equivalent speed measurements.

## Setup

Prerequisites are Python **3.10**, FFmpeg and ffprobe with H.264 support. Node 22 and npm are needed to rebuild the UI. With the packaged release, skip the npm steps unless developing the frontend. Initial dependency installation requires local caches or package registry access. Runtime works offline. Use an unsynced folder for private footage.

### Linux and macOS

Run inside the extracted volley-local directory:

```sh
python3.10 -m venv .venv
. .venv/bin/activate
python -m pip install -r backend/requirements.txt
npm --prefix frontend ci
npm --prefix frontend run build
python -m backend.app.launch
```

### Windows PowerShell

```powershell
py -3.10 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm.cmd --prefix frontend ci
npm.cmd --prefix frontend run build
.\Start-Volley.cmd
```

The launcher opens http://127.0.0.1:8765. Keep the console open. To serve without opening a browser, use `python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8765`. Local health and API schema are at `/health` and `/openapi.json`. Run one server worker. For Docker use `docker compose up --build` and open the same URL. For frontend development use `npm --prefix frontend run dev` with the API running. To install offline, prepare wheels on the same OS/architecture with `python -m pip wheel -r backend/requirements.txt -w wheelhouse`, then install with `python -m pip install --no-index --find-links wheelhouse -r backend/requirements.txt`.

## Five-minute demo

1. **Minute 1.** Open Practice court · Demo. Click a thumbnail, play it and turn on ball and player tracks. The numbered markers and trajectory are synthetic ground truth.
2. **Minute 2.** Choose a rally on the timeline. Press S to star it. Click Set, add a note, and save. Create a custom tag with shortcut 9, apply it, then undo and redo with Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z.
3. **Minute 3.** Include Set, exclude Error, search your note and save a named preset. Clear all to return to ten clips. Choose an unknown player, assign Setter, and rename them. The player ID retains previous attributions.
4. **Minute 4.** Select two clips via checkboxes. Bulk tag or star them, then export a stitched reel with two seconds before and three after. Download at completion. Individual mode returns MP4/MKV or a ZIP for multiple clips.
5. **Minute 5.** Open ? for the shortcut sheet. Studio uses E for export. Select CourtSense to use Q/E for previous/next play and X for export. Load a local game to start actual analysis. Check its progress or review another match while it runs.

## Data and configuration

`config.yaml` defines storage, model weights, frontend bundle, FFmpeg binaries, sampling rate, resolution, detector thresholds and rally timing. Paths for uploads, clips, thumbs, exports and the database resolve beneath the data directory. Its default is **./data** relative to the repository root. Absolute paths are accepted. Model and frontend paths resolve relative to the repository root. `BALLTIME_DATA`, `BALLTIME_WEIGHTS` and `BALLTIME_ACTION_WEIGHTS` override their YAML settings. `BALLTIME_DEVICE=cpu` is the default; set it to 0 for a compatible local CUDA PyTorch installation. The database stores absolute media paths. Back up the whole data directory while the app is stopped.

`python -m backend.app.seed` initializes the schema and the ten-clip demo independently. First startup does this automatically. Existing matches and edits persist. The seed uses a fixed random seed so demonstrations are reproducible. SQLite models are in backend/app/models.py. Soft deletion hides clips from review and stats.

## Pipeline and replay

All timestamps refer to seconds on the original match. Run stages from the root with **the same work directory for each command**. For uploaded footage this is the match's UUID folder beneath uploads.

```sh
python -m backend.app.pipeline ingest work --video match.mp4
python -m backend.app.pipeline detect work
python -m backend.app.pipeline track work
python -m backend.app.pipeline segment work
python -m backend.app.pipeline classify work
python -m backend.app.pipeline export work --video match.mp4 --start 12 --end 18
```

| Stage | Persisted artifacts |
|---|---|
| Ingest | Source metadata, sampled JPEGs, frames.json with timestamps and paths |
| Detect | detections.json with per-frame person and sports-ball boxes |
| Track | tracks.json with normalized boxes, timestamps and match-local IDs |
| Segment | rallies.json with padded bounds, ball presence and confidence |
| Classify | action-suggestions.json and actions.json with optional local proposals |
| Export | Individual cut manifests, requested job metadata, MP4/MKV/ZIP outputs |

ByteTrack associates person detections. Fast ball detections use predicted center and displacement to handle non-overlapping successive boxes. Only sustained ball movement starts a rally. Defaults are a 3-second rolling window, 0.75 seconds of motion, 5 seconds of ball absence, a merge gap below 2 seconds, and 1 second before plus 2 seconds after. Bounds are clamped to the match. A match with zero qualifying rallies enters **Needs manual review**, where you can watch the original and retry analysis. Retained frames consume disk space but allow classifier and tracker experiments without re-decoding.

Individual clips stream-copy packets. MP4 edit lists can retain invisible keyframe preroll. MKV is the fallback when MP4 cannot store a codec. Browser support and exact boundaries depend on codec, keyframes, packet timing and the player. Stitched exports decode the requested source intervals, encode consistent H.264/AAC parts, and concatenate those parts without another encode. Clips and originals support HTTP byte ranges.

## Open-source contributions

| Project | Role in this build |
|---|---|
| [Sportvision](https://github.com/napo/sportvision) | Design reference for keeping coach-facing event tags beside the video. |
| [VAA](https://github.com/asigatchov/VAA) | Navigation reference. The optional CourtSense Q/E layout jumps between saved clip starts. |
| [volleyball_analytics](https://github.com/masouduut94/volleyball_analytics) | Architectural reference for a separate action model. The included local adapter runs optional weights on frames inside detected rallies and surfaces proposals for review. See ACTION-SUGGESTIONS.md. |
| [OVML](https://github.com/openvolley/ovml) | Candidate detector for a future accuracy comparison. The shipping pipeline runs in Python. |

The bundled COCO checkpoint is Ultralytics yolov8n.pt, SHA-256 f59b3d833e2ff32e194b5bb8e08d211dc7c5bdf144b90d2c8412c47ccfc83b36. Its license is included in models/. Inter ships locally with its license. The optional action model requires a separate compatible local checkpoint. Setting BALLTIME_POSE=1 records unknown pose labels until a pose classifier is provided.

## Tests and limitations

```sh
python -m pytest -q backend/tests
```

Set VOLLEY_TEST_CV=1 to include actual YOLO and ByteTrack inference on a moving crop of the sample photograph distributed with Ultralytics. Browser regression tests use a local Chromium and playwright-core 1.56.1. Set CHROME_PATH, NODE_PATH, and BALLTIME_PYTHON, build the frontend, then run `node backend/tests/browser.cjs`. The browser test uses a temporary database.

Player IDs are match-local and can fragment after occlusion. Tags and per-player counts describe attributed clips. They do not establish who made each individual contact. Real-match rally precision and recall need a labeled game. Next steps are evaluating a volleyball-specific ball detector, measuring timing errors on those rallies, adding contact-level pose recognition and player re-identification, then calibrating the court for position and rotation analytics.
