from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_db
from app.cache import cache_get, cache_set
from app.schemas.statistics import QualitySummary, QualityByStation, DistributionResponse, TrendResponse
from app.schemas.common import ChartDataPoint, TimeSeriesPoint

router = APIRouter(prefix="/api/quality", tags=["quality"])

# ais_errors has no error_type column — only free-text error_message.
# Bucket it ourselves via ILIKE, in the order observed in production data
# (mostly "unsupported AIS packet type ..." from ais.DataLinkManagementMessage etc).
_BUCKET_SQL = """
    CASE
        WHEN error_message ILIKE '%%unsupported%%'                        THEN 'unsupported_type'
        WHEN error_message ILIKE '%%duplicat%%'                           THEN 'duplicate'
        WHEN error_message ILIKE '%%mmsi%%'                               THEN 'invalid_mmsi'
        WHEN error_message ILIKE '%%parse%%'
          OR error_message ILIKE '%%decode%%'
          OR error_message ILIKE '%%checksum%%'
          OR error_message ILIKE '%%does not start%%'                     THEN 'parse_error'
        ELSE 'other'
    END
"""

_SEVERITY_OK = "ok"
_SEVERITY_WARN = "warning"
_SEVERITY_CRIT = "critical"


def _severity(rate_pct: float) -> str:
    if rate_pct >= 5.0:
        return _SEVERITY_CRIT
    if rate_pct >= 3.0:
        return _SEVERITY_WARN
    return _SEVERITY_OK


async def _get_error_type_counts(db: AsyncSession) -> dict[str, int]:
    rows = (
        await db.execute(
            text(f"""
                SELECT {_BUCKET_SQL} AS bucket, COUNT(*)
                FROM ais_errors
                WHERE received_at >= CURRENT_DATE
                GROUP BY bucket
            """)
        )
    ).all()
    return {str(r[0]): int(r[1]) for r in rows}


async def _get_station_errors(db: AsyncSession) -> list[tuple[str, int]]:
    """Try GROUP BY station_id on ais_errors. Returns [] if column missing."""
    try:
        rows = (
            await db.execute(
                text("""
                    SELECT station_id::text, COUNT(*)
                    FROM ais_errors
                    WHERE received_at >= NOW() - INTERVAL '7 days'
                      AND station_id IS NOT NULL
                    GROUP BY station_id
                    ORDER BY COUNT(*) DESC
                """)
            )
        ).all()
        return [(str(r[0]), int(r[1])) for r in rows]
    except Exception:
        return []


async def _get_daily_errors(db: AsyncSession) -> list[tuple]:
    """Daily error count for last 30 days."""
    try:
        rows = (
            await db.execute(
                text("""
                    SELECT date_trunc('day', received_at)::date AS day, COUNT(*) AS cnt
                    FROM ais_errors
                    WHERE received_at >= NOW() - INTERVAL '30 days'
                    GROUP BY day
                    ORDER BY day
                """)
            )
        ).all()
        return rows
    except Exception:
        return []


@router.get("/summary", response_model=QualitySummary)
async def get_quality_summary(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("quality:summary")
    if cached:
        return QualitySummary(**cached)

    try:
        total_errors = int(
            (await db.scalar(text("SELECT COUNT(*) FROM ais_errors WHERE received_at >= CURRENT_DATE"))) or 0
        )
    except Exception:
        try:
            total_errors = int((await db.scalar(text("SELECT COUNT(*) FROM ais_errors"))) or 0)
        except Exception:
            total_errors = 0

    total_messages = int(
        (await db.scalar(text("SELECT COUNT(*) FROM ais_raw_message WHERE received_at >= CURRENT_DATE"))) or 0
    )

    type_map = await _get_error_type_counts(db)

    error_rate = round(total_errors / max(1, total_messages) * 100, 3)
    result = QualitySummary(
        error_rate_pct=error_rate,
        total_errors=total_errors,
        total_messages=total_messages,
        parse_error_count=type_map.get("parse_error", 0),
        duplicate_count=type_map.get("duplicate", 0),
        invalid_mmsi_count=type_map.get("invalid_mmsi", 0),
        status=_severity(error_rate),
    )
    await cache_set("quality:summary", result.model_dump(), ttl=300)
    return result


@router.get("/by-station", response_model=list[QualityByStation])
async def get_quality_by_station(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("quality:by_station")
    if cached:
        return [QualityByStation(**s) for s in cached]

    station_errors = await _get_station_errors(db)

    # Attempt per-station message totals from ais_raw_message
    msg_per_station: dict[str, int] = {}
    try:
        msg_rows = (
            await db.execute(
                text("""
                    SELECT station_id::text, COUNT(*)
                    FROM ais_raw_message
                    WHERE received_at >= NOW() - INTERVAL '7 days'
                      AND station_id IS NOT NULL
                    GROUP BY station_id
                """)
            )
        ).all()
        msg_per_station = {str(r[0]): int(r[1]) for r in msg_rows}
    except Exception:
        pass

    # Fallback denominator: distribute total messages evenly per station
    if not msg_per_station and station_errors:
        total_msgs_7d = int(
            (await db.scalar(
                text("SELECT COUNT(*) FROM ais_raw_message WHERE received_at >= NOW() - INTERVAL '7 days'")
            )) or 0
        )
        n = len(station_errors)
        fallback = total_msgs_7d // n if n else 1
        msg_per_station = {sid: fallback for sid, _ in station_errors}

    result: list[QualityByStation] = []
    for sid, err_cnt in station_errors:
        total = msg_per_station.get(sid, max(err_cnt, 1))
        rate = round(err_cnt / max(1, total) * 100, 3)
        result.append(
            QualityByStation(
                station_id=sid,
                error_count=err_cnt,
                total_count=total,
                error_rate_pct=rate,
                severity=_severity(rate),
            )
        )

    result.sort(key=lambda s: s.error_rate_pct, reverse=True)
    await cache_set("quality:by_station", [s.model_dump() for s in result], ttl=300)
    return result


@router.get("/by-type", response_model=DistributionResponse)
async def get_quality_by_type(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("quality:by_type")
    if cached:
        return DistributionResponse(**cached)

    type_map = await _get_error_type_counts(db)

    if not type_map:
        try:
            total_errors = int(
                (await db.scalar(text("SELECT COUNT(*) FROM ais_errors WHERE received_at >= CURRENT_DATE"))) or 0
            )
        except Exception:
            try:
                total_errors = int((await db.scalar(text("SELECT COUNT(*) FROM ais_errors"))) or 0)
            except Exception:
                total_errors = 0
        type_map = {"unknown": total_errors} if total_errors else {}

    total = sum(type_map.values())
    data = [
        ChartDataPoint(label=k or "Unknown", value=v)
        for k, v in sorted(type_map.items(), key=lambda x: -x[1])
    ]
    result = DistributionResponse(title="Distribusi Tipe Error", data=data, total=total)
    await cache_set("quality:by_type", result.model_dump(), ttl=3600)
    return result


@router.get("/trend", response_model=TrendResponse)
async def get_quality_trend(db: AsyncSession = Depends(get_db)):
    """Daily error count trend for the last 30 days."""
    cached = await cache_get("quality:trend")
    if cached:
        return TrendResponse(**cached)

    rows = await _get_daily_errors(db)
    data = [TimeSeriesPoint(timestamp=str(r[0]), value=int(r[1])) for r in rows]
    result = TrendResponse(title="Tren Error Harian (30 Hari)", data=data, period="30d")
    await cache_set("quality:trend", result.model_dump(), ttl=900)
    return result
