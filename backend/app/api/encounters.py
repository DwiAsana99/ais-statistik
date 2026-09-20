import hashlib
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.cache import cache_get, cache_set
from app.schemas.encounter import EncounterListResponse, EncounterDetail
from app.services.encounter_service import detect_encounters, get_encounter_detail

router = APIRouter(prefix="/api/encounters", tags=["encounters"])


@router.get("", response_model=EncounterListResponse)
async def list_encounters(
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    distance_m: float = Query(500, ge=10, le=5000),
    time_window_s: int = Query(600, ge=30, le=3600),
    min_duration_minutes: float = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    cache_key_raw = f"{date_from}:{date_to}:{distance_m}:{time_window_s}:{min_duration_minutes}"
    cache_key = "encounters:" + hashlib.md5(cache_key_raw.encode()).hexdigest()

    cached = await cache_get(cache_key)
    if cached:
        return EncounterListResponse(**cached)

    items, resolved_from, resolved_to = await detect_encounters(
        db, date_from, date_to, distance_m, time_window_s, min_duration_minutes
    )

    result = EncounterListResponse(
        items=items, total=len(items), date_from=resolved_from, date_to=resolved_to, distance_m=distance_m
    )
    await cache_set(cache_key, result.model_dump(mode="json"), ttl=1800)
    return result


@router.get("/{encounter_id}", response_model=EncounterDetail)
async def get_encounter(
    encounter_id: str,
    distance_m: float = Query(500, ge=10, le=5000),
    time_window_s: int = Query(600, ge=30, le=3600),
    db: AsyncSession = Depends(get_db),
):
    try:
        mmsi_a_str, mmsi_b_str, first_seen_ts = encounter_id.split(":")
        mmsi_a, mmsi_b = int(mmsi_a_str), int(mmsi_b_str)
        first_seen = datetime.fromtimestamp(int(first_seen_ts))
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Invalid encounter id")

    # window centered on the encounter's start, not "now" — the encounter may be hours/days old
    date_from = first_seen - timedelta(minutes=30)
    date_to = first_seen + timedelta(hours=2)
    detail = await get_encounter_detail(db, mmsi_a, mmsi_b, date_from, date_to, distance_m, time_window_s)
    if not detail:
        raise HTTPException(status_code=404, detail="Encounter not found")
    return detail
