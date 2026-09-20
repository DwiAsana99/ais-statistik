from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_db
from app.cache import cache_get, cache_set
from app.schemas.statistics import MessageSummary, MessageTypeBreakdown, TrendResponse
from app.schemas.common import TimeSeriesPoint

router = APIRouter(prefix="/api/messages", tags=["messages"])

# AIS msg_type → Class A (SOTDMA/ITDMA/RATDMA/interrogation) vs Class B (CS/extended)
_CLASS_A_TYPES = (1, 2, 3, 4, 11, 14, 17, 21)
_CLASS_B_TYPES = (18, 19, 24)


@router.get("/summary", response_model=MessageSummary)
async def get_message_summary(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("messages:summary")
    if cached:
        return MessageSummary(**cached)

    row = (
        await db.execute(
            text("""
                SELECT
                    COUNT(*)                                              AS total,
                    COUNT(DISTINCT mmsi)                                  AS vessel_count,
                    COUNT(DISTINCT msg_type)                              AS unique_types,
                    SUM(CASE WHEN msg_type IN (1,2,3,4,11,14,17,21) THEN 1 ELSE 0 END) AS class_a,
                    SUM(CASE WHEN msg_type IN (18,19,24)             THEN 1 ELSE 0 END) AS class_b,
                    COUNT(*) / 24.0                                      AS throughput_per_hour
                FROM ais_raw_message
                WHERE received_at >= NOW() - INTERVAL '24 hours'
                  AND mmsi IS NOT NULL
            """)
        )
    ).first()

    total = int(row[0] or 0)
    vessel_count = int(row[1] or 0)
    class_a = int(row[3] or 0)
    class_b = int(row[4] or 0)

    result = MessageSummary(
        total_messages=total,
        avg_per_vessel=round(total / vessel_count, 1) if vessel_count else 0.0,
        unique_msg_types=int(row[2] or 0),
        class_a_pct=round(class_a / total * 100, 1) if total else 0.0,
        class_b_pct=round(class_b / total * 100, 1) if total else 0.0,
        throughput_per_hour=round(float(row[5] or 0), 1),
    )
    await cache_set("messages:summary", result.model_dump(), ttl=300)
    return result


@router.get("/by-type", response_model=list[MessageTypeBreakdown])
async def get_messages_by_type(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("messages:by_type")
    if cached:
        return [MessageTypeBreakdown(**r) for r in cached]

    rows = (
        await db.execute(
            text("""
                SELECT
                    r.msg_type,
                    m.name          AS type_name,
                    COUNT(*)        AS cnt,
                    COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () AS pct
                FROM ais_raw_message r
                LEFT JOIN ais_msg_type m ON r.msg_type = m.code
                WHERE r.received_at >= NOW() - INTERVAL '30 days'
                  AND r.mmsi IS NOT NULL
                GROUP BY r.msg_type, m.name
                ORDER BY cnt DESC
            """)
        )
    ).all()

    result = [
        MessageTypeBreakdown(
            msg_type=int(r[0]),
            type_name=r[1],
            count=int(r[2]),
            pct=round(float(r[3]), 2),
        )
        for r in rows
    ]
    await cache_set("messages:by_type", [x.model_dump() for x in result], ttl=3600)
    return result


@router.get("/volume-daily", response_model=TrendResponse)
async def get_volume_daily(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("messages:volume_daily")
    if cached:
        return TrendResponse(**cached)

    rows = (
        await db.execute(
            text("""
                SELECT date_trunc('day', received_at)::date AS day, COUNT(*) AS cnt
                FROM ais_raw_message
                WHERE received_at >= NOW() - INTERVAL '30 days'
                  AND mmsi IS NOT NULL
                GROUP BY day
                ORDER BY day
            """)
        )
    ).all()

    data = [TimeSeriesPoint(timestamp=str(r[0]), value=int(r[1])) for r in rows]
    result = TrendResponse(title="Volume Pesan Harian (30 Hari)", data=data, period="30d")
    await cache_set("messages:volume_daily", result.model_dump(), ttl=900)
    return result


@router.get("/throughput", response_model=TrendResponse)
async def get_throughput(db: AsyncSession = Depends(get_db)):
    """Per-hour message count for the last 24 hours — for a line chart."""
    cached = await cache_get("messages:throughput")
    if cached:
        return TrendResponse(**cached)

    rows = (
        await db.execute(
            text("""
                SELECT
                    date_trunc('hour', received_at) AS hour_bucket,
                    COUNT(*)                        AS cnt
                FROM ais_raw_message
                WHERE received_at >= NOW() - INTERVAL '24 hours'
                  AND mmsi IS NOT NULL
                GROUP BY hour_bucket
                ORDER BY hour_bucket
            """)
        )
    ).all()

    data = [TimeSeriesPoint(timestamp=str(r[0]), value=int(r[1])) for r in rows]
    result = TrendResponse(title="Throughput Pesan per Jam (24 Jam Terakhir)", data=data, period="24h")
    await cache_set("messages:throughput", result.model_dump(), ttl=300)
    return result
