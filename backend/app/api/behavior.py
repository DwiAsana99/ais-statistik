import hashlib
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.cache import cache_get, cache_set
from app.schemas.behavior import LoiteringListResponse, LoiteringDetail
from app.services.loitering_service import detect_loitering, get_loitering_detail

router = APIRouter(prefix="/api/behavior", tags=["behavior"])


@router.get("/loitering", response_model=LoiteringListResponse)
async def list_loitering(
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    avg_sog_kn_lt: float = Query(2.0, ge=0.1, le=10.0),
    duration_h_gt: float = Query(2.0, ge=0.1, le=48.0),
    avg_dist_port_km_gt: float = Query(37.04, ge=0.0, le=500.0),
    db: AsyncSession = Depends(get_db),
):
    cache_key_raw = f"{date_from}:{date_to}:{avg_sog_kn_lt}:{duration_h_gt}:{avg_dist_port_km_gt}"
    cache_key = "behavior:loitering:" + hashlib.md5(cache_key_raw.encode()).hexdigest()

    cached = await cache_get(cache_key)
    if cached:
        return LoiteringListResponse(**cached)

    items, resolved_from, resolved_to = await detect_loitering(
        db, date_from, date_to, avg_sog_kn_lt, duration_h_gt, avg_dist_port_km_gt
    )

    result = LoiteringListResponse(
        items=items,
        total=len(items),
        date_from=resolved_from,
        date_to=resolved_to,
    )
    await cache_set(cache_key, result.model_dump(mode="json"), ttl=1800)
    return result


@router.get("/loitering/{event_id}", response_model=LoiteringDetail)
async def get_loitering_event(
    event_id: str,
    db: AsyncSession = Depends(get_db),
):
    cache_key = f"behavior:loitering_detail:{event_id}"
    cached = await cache_get(cache_key)
    if cached:
        return LoiteringDetail(**cached)

    detail = await get_loitering_detail(db, event_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Loitering event not found")

    await cache_set(cache_key, detail.model_dump(mode="json"), ttl=1800)
    return detail
