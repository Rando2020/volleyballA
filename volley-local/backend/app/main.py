from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator, Awaitable, Callable
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import Response

from .api import clips, coaching, exports, legacy, matches, stats, tags
from .config import DIST


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    from .seed import recover_interrupted_jobs, seed

    seed()
    recover_interrupted_jobs()
    yield


app = FastAPI(title="Balltime Local", lifespan=lifespan, docs_url=None, redoc_url=None)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["localhost", "127.0.0.1", "[::1]", "testserver"],
)


@app.middleware("http")
async def local_origin(
    req: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    origin = req.headers.get("origin")
    if origin and urlsplit(origin).hostname not in ("localhost", "127.0.0.1", "::1"):
        return JSONResponse({"detail": "Local browser required"}, status_code=403)
    return await call_next(req)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


for router in [
    coaching.router,
    legacy.router,
    stats.router,
    exports.router,
    tags.router,
    matches.router,
    clips.router,
]:
    app.include_router(router)
    app.include_router(router, prefix="/api", include_in_schema=False)
if DIST.is_dir():
    app.mount("/", StaticFiles(directory=DIST, html=True))
