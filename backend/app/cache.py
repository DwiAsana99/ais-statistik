import redis.asyncio as redis
import orjson
from typing import Any

from app.config import get_settings

settings = get_settings()

redis_client = redis.Redis(
    host=settings.redis_host,
    port=settings.redis_port,
    password=settings.redis_password,
    decode_responses=True,
)


async def cache_get(key: str) -> Any | None:
    data = await redis_client.get(key)
    if data is None:
        return None
    return orjson.loads(data)


async def cache_set(key: str, value: Any, ttl: int = 300) -> None:
    await redis_client.set(key, orjson.dumps(value), ex=ttl)


async def cache_delete(key: str) -> None:
    await redis_client.delete(key)


async def check_redis() -> bool:
    try:
        return await redis_client.ping()
    except Exception:
        return False
