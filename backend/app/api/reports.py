import calendar
import hashlib
from datetime import datetime
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_db
from app.cache import cache_get, cache_set
from app.schemas.common import ChartDataPoint
from app.schemas.statistics import MonthlyReport, MonthlyReportDetail, WeeklyBreakdown
from app.services.report_service import (
    fetch_vessels_rows,
    fetch_encounters_rows,
    build_csv,
    build_excel,
    build_pdf,
)

router = APIRouter(prefix="/api/reports", tags=["reports"])

MEDIA_TYPES = {
    "csv": "text/csv",
    "excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pdf": "application/pdf",
}
EXTENSIONS = {"csv": "csv", "excel": "xlsx", "pdf": "pdf"}
REPORT_TITLES = {"vessels": "Daftar Kapal", "encounters": "Pertemuan Kapal"}

MONTH_NAMES = {
    1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr",
    5: "Mei", 6: "Jun", 7: "Jul", 8: "Agu",
    9: "Sep", 10: "Okt", 11: "Nov", 12: "Des",
}


@router.get("/export")
async def export_report(
    format: str = Query("csv", pattern="^(csv|excel|pdf)$"),
    report_type: str = Query("vessels", pattern="^(vessels|encounters)$"),
    search: str | None = Query(None),
    ship_type: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    distance_m: float = Query(500, ge=10, le=5000),
    db: AsyncSession = Depends(get_db),
):
    if report_type == "vessels":
        columns, rows = await fetch_vessels_rows(db, search, ship_type)
    else:
        columns, rows = await fetch_encounters_rows(db, date_from, date_to, distance_m)

    title = REPORT_TITLES[report_type]

    if format == "csv":
        content = build_csv(columns, rows)
    elif format == "excel":
        content = build_excel(columns, rows, title)
    else:
        content = build_pdf(columns, rows, title)

    filename = f"{report_type}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.{EXTENSIONS[format]}"

    return Response(
        content=content,
        media_type=MEDIA_TYPES[format],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/monthly", response_model=list[MonthlyReport])
async def get_monthly_reports(db: AsyncSession = Depends(get_db)):
    cache_key = "reports:monthly:list"
    cached = await cache_get(cache_key)
    if cached:
        return [MonthlyReport(**m) for m in cached]

    rows = (
        await db.execute(
            text("""
                SELECT
                    date_trunc('month', received_at) AS month_start,
                    COUNT(*)                          AS total_messages,
                    COUNT(DISTINCT mmsi)              AS total_vessels,
                    COUNT(DISTINCT date_trunc('day', received_at)) AS active_days
                FROM ais_raw_message
                WHERE received_at >= NOW() - INTERVAL '13 months'
                  AND received_at <  date_trunc('month', NOW()) + INTERVAL '1 month'
                  AND mmsi IS NOT NULL
                GROUP BY month_start
                ORDER BY month_start DESC
                LIMIT 13
            """)
        )
    ).all()

    error_by_month: dict = {}
    try:
        err_rows = (
            await db.execute(
                text("""
                    SELECT date_trunc('month', received_at) AS month_start,
                           COUNT(*) AS error_count
                    FROM ais_errors
                    WHERE received_at >= NOW() - INTERVAL '13 months'
                    GROUP BY month_start
                """)
            )
        ).all()
        for r in err_rows:
            error_by_month[r[0]] = int(r[1])
    except Exception:
        pass

    result: list[MonthlyReport] = []
    for i, r in enumerate(rows):
        month_start = r[0]
        total_messages = int(r[1])
        error_count = error_by_month.get(month_start, 0)
        avg_error_rate = round(error_count / total_messages * 100, 2) if total_messages > 0 else 0.0

        msg_change_pct: float | None = None
        if i < len(rows) - 1:
            prev_msg = int(rows[i + 1][1])
            if prev_msg > 0:
                msg_change_pct = round((total_messages - prev_msg) / prev_msg * 100, 1)

        result.append(
            MonthlyReport(
                year=month_start.year,
                month=month_start.month,
                month_label=f"{MONTH_NAMES[month_start.month]} {month_start.year}",
                total_messages=total_messages,
                total_vessels=int(r[2]),
                active_days=int(r[3]),
                avg_error_rate=avg_error_rate,
                msg_change_pct=msg_change_pct,
            )
        )

    await cache_set(cache_key, [m.model_dump() for m in result], ttl=3600)
    return result


@router.get("/monthly/{year}/{month}", response_model=MonthlyReportDetail)
async def get_monthly_report_detail(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
):
    cache_key = f"reports:monthly:{year}:{month}"
    cached = await cache_get(cache_key)
    if cached:
        return MonthlyReportDetail(**cached)

    last_day = calendar.monthrange(year, month)[1]
    month_start = datetime(year, month, 1)
    month_end = datetime(year, month, last_day, 23, 59, 59)
    params = {"month_start": month_start, "month_end": month_end}

    summary_row = (
        await db.execute(
            text("""
                SELECT COUNT(*)              AS total_messages,
                       COUNT(DISTINCT mmsi)  AS total_vessels,
                       COUNT(DISTINCT date_trunc('day', received_at)) AS active_days
                FROM ais_raw_message
                WHERE received_at BETWEEN :month_start AND :month_end
                  AND mmsi IS NOT NULL
            """),
            params,
        )
    ).first()

    total_messages = int(summary_row[0]) if summary_row else 0
    total_vessels  = int(summary_row[1]) if summary_row else 0
    active_days    = int(summary_row[2]) if summary_row else 0

    total_errors = 0
    try:
        err_scalar = (
            await db.execute(
                text("SELECT COUNT(*) FROM ais_errors WHERE received_at BETWEEN :month_start AND :month_end"),
                params,
            )
        ).scalar()
        total_errors = int(err_scalar or 0)
    except Exception:
        pass

    avg_error_rate = round(total_errors / total_messages * 100, 2) if total_messages > 0 else 0.0

    weekly_rows = (
        await db.execute(
            text("""
                SELECT EXTRACT(WEEK FROM received_at)::int AS week_num,
                       COUNT(*)              AS messages,
                       COUNT(DISTINCT mmsi)  AS vessels
                FROM ais_raw_message
                WHERE received_at BETWEEN :month_start AND :month_end
                  AND mmsi IS NOT NULL
                GROUP BY week_num
                ORDER BY week_num
            """),
            params,
        )
    ).all()

    weekly_breakdown = [
        WeeklyBreakdown(week_num=int(r[0]), messages=int(r[1]), vessels=int(r[2]))
        for r in weekly_rows
    ]

    type_rows = (
        await db.execute(
            text("""
                SELECT COALESCE(st.group_name, 'Unknown') AS label,
                       COUNT(DISTINCT vs.mmsi) AS value
                FROM vessel_states vs
                LEFT JOIN ais_vessel_static avs ON vs.mmsi = avs.mmsi
                LEFT JOIN ais_ship_type st ON avs.ship_type_code = st.code
                GROUP BY st.group_name
                ORDER BY value DESC
                LIMIT 8
            """)
        )
    ).all()
    top_ship_types = [ChartDataPoint(label=str(r[0]), value=int(r[1])) for r in type_rows]

    top_stations: list[ChartDataPoint] = []
    try:
        st_rows = (
            await db.execute(
                text("""
                    SELECT station_id::text AS label, COUNT(*) AS value
                    FROM ais_raw_message
                    WHERE received_at BETWEEN :month_start AND :month_end
                      AND station_id IS NOT NULL
                    GROUP BY station_id
                    ORDER BY value DESC
                    LIMIT 5
                """),
                params,
            )
        ).all()
        top_stations = [ChartDataPoint(label=str(r[0]), value=int(r[1])) for r in st_rows]
    except Exception:
        pass

    detail = MonthlyReportDetail(
        year=year,
        month=month,
        month_label=f"{MONTH_NAMES[month]} {year}",
        total_messages=total_messages,
        total_vessels=total_vessels,
        active_days=active_days,
        avg_error_rate=avg_error_rate,
        msg_change_pct=None,
        total_errors=total_errors,
        weekly_breakdown=weekly_breakdown,
        top_ship_types=top_ship_types,
        top_stations=top_stations,
    )

    await cache_set(cache_key, detail.model_dump(mode="json"), ttl=3600)
    return detail
