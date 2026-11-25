from __future__ import annotations

import time
import unittest
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

from fastapi.testclient import TestClient

from backend.app.main import app

from .conftest import storage


class Studio(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app).__enter__()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.client.__exit__(None, None, None)
        from backend.app.db import engine
        from backend.app.pipeline.jobs import queue

        queue.submit(lambda: None).result()
        engine.dispose()

    def test_bulk_edit_rolls_back_on_invalid_clip(self) -> None:
        c = self.client
        mid = c.get("/matches").json()[0]["id"]
        clip = c.get(f"/matches/{mid}/clips").json()[0]
        result = c.patch(
            "/bulk/clips",
            json={
                "changes": [
                    {"id": clip["id"], "notes": "unsaved"},
                    {"id": 987654, "notes": "invalid"},
                ]
            },
        )
        self.assertEqual(result.status_code, 404)
        self.assertEqual(
            c.get(f"/matches/{mid}/clips").json()[0]["notes"], clip["notes"]
        )

    def test_review_and_exports(self) -> None:
        c = self.client
        mid = c.get("/matches").json()[0]["id"]
        clips = c.get(f"/matches/{mid}/clips").json()
        self.assertEqual(len(clips), 10)
        a, b = [clip["id"] for clip in clips[:2]]
        video = c.get(f"/clips/{a}/video", headers={"Range": "bytes=0-31"})
        self.assertEqual((video.status_code, len(video.content)), (206, 32))
        self.assertTrue(c.get(f"/clips/{a}/thumb").content.startswith(b"\xff\xd8"))
        tag = c.post(
            "/tags", json={"name": "Pipe", "color": "#ababab", "hotkey": "9"}
        ).json()["id"]
        self.assertEqual(
            c.post(
                "/tags", json={"name": "Other", "color": "#ababab", "hotkey": "9"}
            ).status_code,
            409,
        )
        player = c.post(f"/matches/{mid}/players", json={"label": "Unknown P4"}).json()[
            "id"
        ]
        self.assertEqual(
            c.patch(
                f"/clips/{a}",
                json={
                    "tags": [tag],
                    "starred": True,
                    "notes": "Back row",
                    "players": [{"player_id": player, "role": "Outside"}],
                },
            ).status_code,
            200,
        )
        c.patch(f"/players/{player}", json={"label": "Sam"})
        stats = c.get(f"/matches/{mid}/stats").json()
        self.assertEqual(stats["by_player"][str(player)][str(tag)], 1)
        self.assertEqual(
            c.post(
                "/presets", json={"name": "Pipes", "json_query": {"include": [tag]}}
            ).status_code,
            200,
        )
        for mode in ("individual", "reel"):
            job = c.post(
                f"/clips/{a}/export",
                json={"clip_ids": [b, a], "mode": mode, "before": 5, "after": 2},
            ).json()["job_id"]
            for _ in range(200):
                status = c.get(f"/exports/{job}").json()
                if status["status"] in ("ready", "failed"):
                    break
                time.sleep(0.1)
            self.assertEqual(status["status"], "ready", status)
            data = c.get(status["download_url"]).content
            if mode == "individual":
                self.assertEqual(len(ZipFile(BytesIO(data)).namelist()), 2)
            else:
                self.assertEqual(data[4:8], b"ftyp")
        self.assertEqual(c.delete(f"/clips/{a}").status_code, 200)
        self.assertEqual(c.get(f"/clips/{a}/video").status_code, 404)

    def test_upload_and_failure(self) -> None:
        c = self.client
        self.assertEqual(
            c.post("/matches", files={"file": ("bad.mp4", b"broken")}).status_code, 422
        )
        path = Path(storage.name) / "uploads" / "demo" / "court.mp4"
        with path.open("rb") as file:
            resp = c.post("/matches", files={"file": ("Practice.mp4", file)})
        self.assertEqual(resp.status_code, 202)
        i = resp.json()["match_id"]
        for _ in range(50):
            row = c.get(f"/matches/{i}").json()
            if row["status"] == "failed":
                break
            time.sleep(0.05)
        self.assertIn("weights", row["error"])
        self.assertEqual(c.post(f"/matches/{i}/retry").status_code, 202)
        self.assertEqual(
            c.get(
                "/matches", headers={"origin": "https://outside.invalid"}
            ).status_code,
            403,
        )
