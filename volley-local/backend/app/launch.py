from __future__ import annotations

import threading
import time
import urllib.request
import webbrowser

import uvicorn


def open_studio() -> None:
    for _ in range(100):
        try:
            with urllib.request.urlopen("http://127.0.0.1:8765/api/matches", timeout=1):
                webbrowser.open("http://127.0.0.1:8765/")
                return
        except OSError:
            time.sleep(0.3)


if __name__ == "__main__":
    threading.Thread(target=open_studio, daemon=True).start()
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8765)
