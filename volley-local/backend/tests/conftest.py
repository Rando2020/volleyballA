import os
import tempfile
from pathlib import Path

storage = tempfile.TemporaryDirectory()
os.environ["BALLTIME_DATA"] = storage.name
os.environ["BALLTIME_WEIGHTS"] = str(Path(storage.name) / "missing.pt")


def pytest_sessionfinish() -> None:
    from backend.app.db import engine
    from backend.app.pipeline.jobs import queue

    queue.submit(lambda: None).result()
    engine.dispose()
    storage.cleanup()
