from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.cache import cache_get, cache_set
from app.schemas.anomaly import AnomalyA0Summary, AnomalyEventsResponse, AnomalySummary
from app.services.anomaly_service import get_a0_summary, list_events, get_summary

router = APIRouter(prefix="/api/anomaly", tags=["anomaly"])


@router.get("/a0-summary", response_model=AnomalyA0Summary)
async def a0_summary(
    lookback_days: int = Query(7, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
):
    cache_key = f"anomaly:a0_summary:{lookback_days}"
    cached = await cache_get(cache_key)
    if cached:
        return AnomalyA0Summary(**cached)

    result = await get_a0_summary(db, lookback_days)
    await cache_set(cache_key, result, ttl=900)
    return AnomalyA0Summary(**result)


@router.get("/summary", response_model=AnomalySummary)
async def summary(db: AsyncSession = Depends(get_db)):
    cache_key = "anomaly:summary"
    cached = await cache_get(cache_key)
    if cached:
        return AnomalySummary(**cached)

    result = await get_summary(db)
    await cache_set(cache_key, result, ttl=300)
    return AnomalySummary(**result)


@router.get("/events", response_model=AnomalyEventsResponse)
async def events(
    type: str | None = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    cache_key = f"anomaly:events:{type}:{limit}"
    cached = await cache_get(cache_key)
    if cached:
        return AnomalyEventsResponse(**cached)

    items = await list_events(db, type, limit)
    result = {"items": items, "total": len(items)}
    await cache_set(cache_key, result, ttl=300)
    return AnomalyEventsResponse(**result)
