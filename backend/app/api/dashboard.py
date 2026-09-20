from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text

from app.database import get_db
from app.cache import cache_get, cache_set
from app.models.vessel import VesselState, AisVesselStatic
from app.models.reference import AisShipType, AisNavStatus
from app.schemas.statistics import DashboardOverview, DistributionResponse
from app.schemas.common import ChartDataPoint

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

SHIP_TYPE_COLORS = {
    "Cargo": "#4e79a7",
    "Tanker": "#f28e2b",
    "Fishing": "#59a14f",
    "Passenger": "#e15759",
    "Tug": "#76b7b2",
    "Other": "#b07aa1",
    "Sailing": "#ff9da7",
    "Military": "#9c755f",
    "Towing": "#bab0ac",
    "Pleasure": "#edc948",
    "Not available": "#aaa",
}

NAV_STATUS_COLORS = {
    "Under way using engine": "#4e79a7",
    "At anchor": "#f28e2b",
    "Moored": "#59a14f",
    "Not defined": "#aaa",
    "Under way sailing": "#76b7b2",
    "Engaged in fishing": "#e15759",
    "Restricted manoeuvrability": "#b07aa1",
    "Not under command": "#ff9da7",
    "Aground": "#9c755f",
}


@router.get("/overview", response_model=DashboardOverview)
async def get_overview(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("dashboard:overview")
    if cached:
        return DashboardOverview(**cached)

    total = await db.scalar(select(func.count()).select_from(AisVesselStatic))
    active = await db.scalar(select(func.count()).select_from(VesselState))

    nav_counts = (
        await db.execute(
            select(VesselState.last_nav_status, func.count())
            .group_by(VesselState.last_nav_status)
        )
    ).all()

    nav_map = {row[0]: row[1] for row in nav_counts}
    underway = nav_map.get(0, 0) + nav_map.get(8, 0)
    anchored = nav_map.get(1, 0)
    moored = nav_map.get(5, 0)

    ship_types = await db.scalar(
        select(func.count(func.distinct(AisVesselStatic.ship_type_code)))
    )

    messages_today = await db.scalar(
        text("SELECT COUNT(*) FROM ais_raw_message WHERE received_at >= CURRENT_DATE")
    )

    stations_online = await db.scalar(
        text("SELECT COUNT(DISTINCT last_station_id) FROM vessel_states WHERE last_station_id IS NOT NULL")
    )

    errors_today = 0
    try:
        errors_today = await db.scalar(
            text("SELECT COUNT(*) FROM ais_errors WHERE received_at >= CURRENT_DATE")
        )
    except Exception:
        pass

    messages_count = int(messages_today or 0)
    error_rate = round((errors_today or 0) / max(1, messages_count) * 100, 2)

    result = DashboardOverview(
        total_vessels=total or 0,
        active_vessels=active or 0,
        vessels_underway=underway,
        vessels_anchored=anchored,
        vessels_moored=moored,
        total_ship_types=ship_types or 0,
        messages_today=messages_count,
        stations_online=int(stations_online or 0),
        error_rate=error_rate,
    )
    await cache_set("dashboard:overview", result.model_dump(), ttl=300)
    return result


@router.get("/vessel-type-distribution", response_model=DistributionResponse)
async def get_vessel_type_distribution(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("dashboard:vessel_type_dist")
    if cached:
        return DistributionResponse(**cached)

    rows = (
        await db.execute(
            select(AisShipType.group_name, func.count())
            .join(AisVesselStatic, AisVesselStatic.ship_type_code == AisShipType.code)
            .group_by(AisShipType.group_name)
            .order_by(func.count().desc())
        )
    ).all()

    total = sum(r[1] for r in rows)
    data = [
        ChartDataPoint(
            label=row[0] or "Unknown",
            value=row[1],
            color=SHIP_TYPE_COLORS.get(row[0], "#ccc"),
        )
        for row in rows
    ]

    result = DistributionResponse(title="Distribusi Tipe Kapal", data=data, total=total)
    await cache_set("dashboard:vessel_type_dist", result.model_dump(), ttl=3600)
    return result


@router.get("/nav-status-distribution", response_model=DistributionResponse)
async def get_nav_status_distribution(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("dashboard:nav_status_dist")
    if cached:
        return DistributionResponse(**cached)

    rows = (
        await db.execute(
            select(AisNavStatus.name, func.count())
            .join(VesselState, VesselState.last_nav_status == AisNavStatus.code)
            .group_by(AisNavStatus.name)
            .order_by(func.count().desc())
        )
    ).all()

    total = sum(r[1] for r in rows)
    data = [
        ChartDataPoint(
            label=row[0],
            value=row[1],
            color=NAV_STATUS_COLORS.get(row[0], "#ccc"),
        )
        for row in rows
    ]

    result = DistributionResponse(title="Distribusi Status Navigasi", data=data, total=total)
    await cache_set("dashboard:nav_status_dist", result.model_dump(), ttl=300)
    return result
