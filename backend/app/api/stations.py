from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_db
from app.cache import cache_get, cache_set
from app.schemas.statistics import StationPerformance, StationKpis

router = APIRouter(prefix="/api/stations", tags=["stations"])

# NOTE (audit 2026-09-20): ais_base_station is NOT the UVMS receiver station list —
# it holds AIS Base Station entities broadcast by other transmitters (msg type 4/11).
# The real receiver stations are the distinct text values seen in
# vessel_states.last_station_id / ais_errors.station_id (currently: "turyapada", "unud").
# ais_raw_message.station_id exists in schema but is always NULL in practice, so
# per-station message throughput cannot be computed from it yet.

ONLINE_THRESHOLD_S = 15 * 60
DEGRADED_THRESHOLD_S = 60 * 60


def _status_from_last_activity(last_activity: datetime | None) -> str:
    if last_activity is None:
        return "unknown"
    age_s = (datetime.now(timezone.utc) - last_activity).total_seconds()
    if age_s <= ONLINE_THRESHOLD_S:
        return "online"
    if age_s <= DEGRADED_THRESHOLD_S:
        return "degraded"
    return "offline"


async def _get_msg_per_hour(db: AsyncSession) -> dict[str, float]:
    """ais_raw_message.station_id is always NULL today, so this returns {} in
    practice — kept so throughput fills in automatically if ingestion is fixed."""
    rows = (
        await db.execute(
            text("""
                SELECT station_id::text, COUNT(*) / 168.0
                FROM ais_raw_message
                WHERE received_at >= NOW() - INTERVAL '7 days'
                  AND station_id IS NOT NULL
                GROUP BY station_id
            """)
        )
    ).all()
    return {str(r[0]): round(float(r[1]), 1) for r in rows}


async def _get_stations(db: AsyncSession) -> list[StationPerformance]:
    vs_rows = (
        await db.execute(
            text("""
                SELECT
                    last_station_id,
                    MAX(last_received_at) AS last_activity,
                    COUNT(DISTINCT mmsi)   AS vessel_count
                FROM vessel_states
                WHERE last_station_id IS NOT NULL
                GROUP BY last_station_id
            """)
        )
    ).all()
    stations: dict[str, dict] = {
        str(r[0]): {"last_activity": r[1], "vessel_count": int(r[2])}
        for r in vs_rows
    }

    # Pick up any station that only shows up in ais_errors (e.g. reporting errors
    # but currently has no vessel attributed to it in vessel_states).
    err_ids = (
        await db.execute(
            text("SELECT DISTINCT station_id FROM ais_errors WHERE station_id IS NOT NULL")
        )
    ).all()
    for (sid,) in err_ids:
        stations.setdefault(str(sid), {"last_activity": None, "vessel_count": 0})

    msg_map = await _get_msg_per_hour(db)

    result = [
        StationPerformance(
            station_id=sid,
            station_name=None,
            mmsi=None,
            lat=None,
            lon=None,
            vessel_count=info["vessel_count"],
            msg_per_hour=msg_map.get(sid, 0.0),
            last_seen=str(info["last_activity"]) if info["last_activity"] else None,
            status=_status_from_last_activity(info["last_activity"]),
        )
        for sid, info in stations.items()
    ]
    result.sort(key=lambda s: s.vessel_count, reverse=True)
    return result


@router.get("/performance", response_model=list[StationPerformance])
async def get_station_performance(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("stations:performance")
    if cached:
        return [StationPerformance(**s) for s in cached]

    result = await _get_stations(db)
    await cache_set("stations:performance", [s.model_dump() for s in result], ttl=300)
    return result


@router.get("/status", response_model=dict)
async def get_station_status(db: AsyncSession = Depends(get_db)):
    """Returns per-status counts."""
    cached = await cache_get("stations:status")
    if cached:
        return cached

    stations = await _get_stations(db)
    counts = {"online": 0, "degraded": 0, "offline": 0, "unknown": 0}
    for s in stations:
        counts[s.status] = counts.get(s.status, 0) + 1

    result = {**counts, "total": len(stations)}
    await cache_set("stations:status", result, ttl=300)
    return result


@router.get("/summary-kpis", response_model=StationKpis)
async def get_station_kpis(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("stations:kpis")
    if cached:
        return StationKpis(**cached)

    stations = await _get_stations(db)
    online = sum(1 for s in stations if s.status == "online")
    degraded = sum(1 for s in stations if s.status == "degraded")
    offline = sum(1 for s in stations if s.status == "offline")

    vessel_coverage = await db.scalar(
        text("""
            SELECT COUNT(DISTINCT mmsi)
            FROM vessel_states
            WHERE last_station_id IS NOT NULL
        """)
    )

    total_throughput = round(sum(s.msg_per_hour for s in stations), 1)

    result = StationKpis(
        total_stations=len(stations),
        online_count=online,
        degraded_count=degraded,
        offline_count=offline,
        total_vessel_coverage=int(vessel_coverage or 0),
        total_throughput_per_hour=total_throughput,
    )
    await cache_set("stations:kpis", result.model_dump(), ttl=300)
    return result
