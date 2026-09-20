import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from app.config import get_settings
from app.api.router import api_router
from app.cache import check_redis, redis_client
from app.database import engine
from app.worker import precompute_loop

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    worker_task = asyncio.create_task(precompute_loop())
    yield
    worker_task.cancel()
    await engine.dispose()
    await redis_client.close()


app = FastAPI(
    title=settings.app_title,
    version=settings.app_version,
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(api_router)


@app.get("/api/health")
async def health():
    from datetime import datetime, timezone

    redis_ok = await check_redis()

    try:
        from sqlalchemy import text
        from app.database import async_session
        async with async_session() as session:
            await session.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    return {
        "status": "ok" if (db_ok and redis_ok) else "degraded",
        "database": db_ok,
        "redis": redis_ok,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
