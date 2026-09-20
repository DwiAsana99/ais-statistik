from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_db
from app.cache import cache_get, cache_set
from app.schemas.statistics import TrendResponse, StationStats, DistributionResponse, HeatmapPoint, TrafficKpis, SogBin
from app.schemas.common import TimeSeriesPoint, ChartDataPoint

router = APIRouter(prefix="/api/traffic", tags=["traffic"])


@router.get("/trend", response_model=TrendResponse)
async def get_traffic_trend(
    period: str = Query("30d", pattern="^(7d|30d|90d)$"),
    db: AsyncSession = Depends(get_db),
):
    cache_key = f"traffic:trend:{period}"
    cached = await cache_get(cache_key)
    if cached:
        return TrendResponse(**cached)

    days = {"7d": 7, "30d": 30, "90d": 90}[period]

    rows = (
        await db.execute(
            text("""
                SELECT date_trunc('day', received_at)::date AS day,
                       COUNT(DISTINCT mmsi) AS vessel_count
                FROM ais_raw_message
                WHERE received_at >= NOW() - make_interval(days => :days)
                  AND mmsi IS NOT NULL
                GROUP BY day
                ORDER BY day
            """),
            {"days": days},
        )
    ).all()

    data = [
        TimeSeriesPoint(timestamp=str(r[0]), value=r[1])
        for r in rows
    ]

    result = TrendResponse(title="Tren Kapal Aktif Harian", data=data, period=period)
    await cache_set(cache_key, result.model_dump(), ttl=900)
    return result


@router.get("/hourly", response_model=DistributionResponse)
async def get_hourly_distribution(
    db: AsyncSession = Depends(get_db),
):
    cached = await cache_get("traffic:hourly")
    if cached:
        return DistributionResponse(**cached)

    rows = (
        await db.execute(
            text("""
                SELECT EXTRACT(HOUR FROM received_at)::int AS hour,
                       COUNT(DISTINCT mmsi) AS vessel_count
                FROM ais_raw_message
                WHERE received_at >= NOW() - INTERVAL '7 days'
                  AND mmsi IS NOT NULL
                GROUP BY hour
                ORDER BY hour
            """)
        )
    ).all()

    data = [
        ChartDataPoint(label=f"{r[0]:02d}:00", value=r[1])
        for r in rows
    ]
    total = sum(r[1] for r in rows)

    result = DistributionResponse(title="Distribusi Trafik per Jam", data=data, total=total)
    await cache_set("traffic:hourly", result.model_dump(), ttl=3600)
    return result


@router.get("/by-station", response_model=list[StationStats])
async def get_traffic_by_station(
    db: AsyncSession = Depends(get_db),
):
    cached = await cache_get("traffic:by_station")
    if cached:
        return [StationStats(**s) for s in cached]

    rows = (
        await db.execute(
            text("""
                SELECT last_station_id, COUNT(*) AS vessel_count
                FROM vessel_states
                WHERE last_station_id IS NOT NULL
                GROUP BY last_station_id
                ORDER BY vessel_count DESC
            """)
        )
    ).all()

    result = [
        StationStats(
            station_id=r[0],
            vessel_count=r[1],
        )
        for r in rows
    ]
    await cache_set("traffic:by_station", [s.model_dump() for s in result], ttl=300)
    return result


@router.get("/heatmap", response_model=list[HeatmapPoint])
async def get_heatmap(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("traffic:heatmap")
    if cached:
        return [HeatmapPoint(**p) for p in cached]

    rows = (
        await db.execute(
            text("""
                SELECT
                    EXTRACT(DOW FROM received_at)::int  AS day,
                    EXTRACT(HOUR FROM received_at)::int AS hour,
                    COUNT(DISTINCT mmsi)                AS vessel_count
                FROM ais_raw_message
                WHERE received_at >= NOW() - INTERVAL '30 days'
                  AND mmsi IS NOT NULL
                GROUP BY day, hour
                ORDER BY day, hour
            """)
        )
    ).all()

    result = [HeatmapPoint(day=r[0], hour=r[1], value=r[2]) for r in rows]
    await cache_set("traffic:heatmap", [p.model_dump() for p in result], ttl=3600)
    return result


@router.get("/daily-by-type", response_model=dict)
async def get_daily_by_type(
    db: AsyncSession = Depends(get_db),
):
    cached = await cache_get("traffic:daily_by_type")
    if cached:
        return cached

    rows = (
        await db.execute(
            text("""
                SELECT st.group_name, COUNT(DISTINCT vs.mmsi) AS cnt
                FROM vessel_states vs
                JOIN ais_vessel_static avs ON vs.mmsi = avs.mmsi
                JOIN ais_ship_type st ON avs.ship_type_code = st.code
                GROUP BY st.group_name
                ORDER BY cnt DESC
            """)
        )
    ).all()

    data = [{"label": r[0], "value": r[1]} for r in rows]
    result = {"title": "Kapal Aktif per Tipe", "data": data, "total": sum(r[1] for r in rows)}
    await cache_set("traffic:daily_by_type", result, ttl=300)
    return result


@router.get("/sog-distribution", response_model=list[SogBin])
async def get_sog_distribution(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("traffic:sog_dist")
    if cached:
        return [SogBin(**b) for b in cached]

    rows = (
        await db.execute(
            text("""
                SELECT
                    FLOOR(sog_knots::float / 2) * 2 AS bin_start,
                    COUNT(*) AS cnt
                FROM ais_position
                WHERE position_time >= NOW() - INTERVAL '7 days'
                  AND sog_knots IS NOT NULL
                  AND sog_knots::float >= 0
                  AND sog_knots::float < 22
                GROUP BY bin_start
                ORDER BY bin_start
            """)
        )
    ).all()

    result = [SogBin(bin_start=float(r[0]), count=int(r[1])) for r in rows]
    await cache_set("traffic:sog_dist", [b.model_dump() for b in result], ttl=900)
    return result


@router.get("/summary-kpis", response_model=TrafficKpis)
async def get_traffic_kpis(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("traffic:kpis")
    if cached:
        return TrafficKpis(**cached)

    active_7d = await db.scalar(
        text("""
            SELECT COUNT(DISTINCT mmsi) FROM ais_raw_message
            WHERE received_at >= NOW() - INTERVAL '7 days' AND mmsi IS NOT NULL
        """)
    )

    median_sog = await db.scalar(
        text("""
            SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sog_knots::float)
            FROM ais_position
            WHERE position_time >= NOW() - INTERVAL '7 days'
              AND sog_knots IS NOT NULL AND sog_knots::float > 0
        """)
    )

    peak_row = (
        await db.execute(
            text("""
                SELECT EXTRACT(HOUR FROM received_at)::int AS hour, COUNT(*) AS cnt
                FROM ais_raw_message
                WHERE received_at >= NOW() - INTERVAL '7 days' AND mmsi IS NOT NULL
                GROUP BY hour
                ORDER BY cnt DESC
                LIMIT 1
            """)
        )
    ).first()

    result = TrafficKpis(
        total_active_vessels_7d=int(active_7d or 0),
        sog_median_knots=round(float(median_sog or 0), 1),
        peak_hour=int(peak_row[0]) if peak_row else 0,
    )
    await cache_set("traffic:kpis", result.model_dump(), ttl=900)
    return result
