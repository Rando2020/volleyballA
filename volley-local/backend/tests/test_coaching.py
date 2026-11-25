import json
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.coaching import Details


def test_coaching_rates_game_boundaries_identity_and_import() -> None:
    with TestClient(app) as client:
        mid = next(
            m["id"]
            for m in client.get("/matches").json()
            if m["filename"].startswith("Practice court")
        )
        clips = client.get(f"/matches/{mid}/clips").json()
        a, b = clips[:2]
        source = client.post(
            f"/matches/{mid}/players", json={"label": "Unknown 98"}
        ).json()["id"]
        target = client.post(
            f"/matches/{mid}/players", json={"label": "Coach test player"}
        ).json()["id"]

        def save(clip: dict, **kw: object) -> None:
            payload = Details(
                event_time=clip["start_ts"],
                player_id=source,
                position="Setter",
                confirmed=True,
            ).model_dump()
            payload.update(kw)
            result = client.put(f"/clips/{clip['id']}/coaching", json=payload)
            assert result.status_code == 200, result.text

        save(a, outcome="Kill", quality="In rhythm")
        save(b, outcome="Unknown", quality="Unknown")
        stat = client.get(f"/matches/{mid}/coaching-stats?player_id={source}").json()
        assert stat["kill_rate"] == {"numerator": 1, "denominator": 1}
        assert stat["hittable_sets"] == {"numerator": 1, "denominator": 1}
        game = client.post(
            f"/matches/{mid}/games", json={"name": "Pool A", "number": 1, "start_ts": 0}
        ).json()["id"]
        start = b["start_ts"]
        second = client.post(
            f"/matches/{mid}/games",
            json={"name": "Pool B", "number": 2, "start_ts": start},
        ).json()["id"]
        listed = client.get(f"/matches/{mid}/clips").json()
        assert listed[0]["game_id"] == game and listed[1]["game_id"] == second
        changed = client.put(
            f"/games/{second}",
            json={"name": "Pool B", "number": 2, "start_ts": start + 0.1},
        )
        assert changed.status_code == 200
        assert client.get(f"/matches/{mid}/clips").json()[1]["game_id"] == game
        result = client.post(f"/players/{source}/identify", json={"target_id": target})
        assert result.status_code == 200, result.text
        assert (
            client.get(f"/matches/{mid}/coaching-stats?player_id={target}").json()[
                "confirmed"
            ]
            == 2
        )
        assert source not in [
            p["id"] for p in client.get(f"/matches/{mid}/players").json()
        ]
        assert (
            client.post(
                f"/players/{target}/identify", json={"target_id": source}
            ).status_code
            == 409
        )
        backup = {
            "version": 1,
            "plays": [
                {
                    "id": "import-regression",
                    "mediaId": "old-video",
                    "start": 3,
                    "end": 4,
                    "player": "Imported setter",
                    "position": "Setter",
                    "quality": "In rhythm",
                    "outcome": "Kill",
                    "notes": "old coaching",
                    "points": [{"time": 3.2, "x": 0.2, "y": 0.4}],
                }
            ],
        }
        request = {"media_id": "old-video", "backup": backup, "confirm_mapping": True}
        response = client.post(f"/matches/{mid}/import-courtsense", json=request)
        assert response.status_code == 200, response.text
        assert response.json()["imported"] == 1
        again = client.post(f"/matches/{mid}/import-courtsense", json=request)
        assert again.json()["imported"] == 0 and again.json()["skipped"] == 1
        original = client.get(f"/matches/{mid}/courtsense-backup").json()[
            "original_plays"
        ]
        assert any(p["points"] == backup["plays"][0]["points"] for p in original)
        assert (
            client.post(
                f"/matches/{mid}/import-courtsense",
                json={**request, "confirm_mapping": False},
            ).status_code
            == 422
        )
        assert (
            client.put("/channel", json={"url": "https://evil.invalid"}).status_code
            == 422
        )
        assert (
            client.put(
                "/channel", json={"url": "https://youtube.com/@court"}
            ).status_code
            == 200
        )
        for clip in clips[:2]:
            client.put(
                f"/clips/{clip['id']}/coaching",
                json=Details(event_time=clip["start_ts"]).model_dump(),
            )


def test_vball_decoder_rejects_ambiguous_peaks() -> None:
    import numpy as np
    from backend.app.pipeline.vball import decode

    heat = np.zeros((288, 512), dtype=np.float32)
    assert decode(heat) is None
    heat[40, 80] = 0.9
    x, y, score = decode(heat)
    assert abs(x - 80.5 / 512) < 1e-6 and score > 0.89
    heat[140, 280] = 0.89
    assert decode(heat) is None
