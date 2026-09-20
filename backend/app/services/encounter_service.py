from datetime import datetime, timedelta
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.encounter import EncounterSummary, EncounterDetail, EncounterTrackPoint

# ais_position has no standalone time index (only mmsi+time, msg_type, geom) and
# 26M rows un-partitioned — a self-join across a wide window would scan too much,
# so the detection window is hard-capped regardless of what the caller requests.
MAX_WINDOW_HOURS = 24


def _clamp_window(date_from: datetime | None, date_to: datetime | None) -> tuple[datetime, datetime]:
    now = datetime.utcnow()
    if date_to is None:
        date_to = now
    if date_from is None:
        date_from = date_to - timedelta(hours=6)
    if date_to - date_from > timedelta(hours=MAX_WINDOW_HOURS):
        date_from = date_to - timedelta(hours=MAX_WINDOW_HOURS)
    return date_from, date_to


async def detect_encounters(
    db: AsyncSession,
    date_from: datetime | None,
    date_to: datetime | None,
    distance_m: float = 500,
    time_window_s: int = 600,
    min_duration_minutes: float = 0,
    limit: int = 200,
) -> tuple[list[EncounterSummary], datetime, datetime]:
    date_from, date_to = _clamp_window(date_from, date_to)

    rows = (
        await db.execute(
            text("""
                WITH recent AS (
                    SELECT mmsi, position_time, geom
                    FROM ais_position
                    WHERE position_time BETWEEN :date_from AND :date_to
                      AND geom IS NOT NULL
                ),
                pairs AS (
                    SELECT
                        a.mmsi AS mmsi_a, b.mmsi AS mmsi_b,
                        a.position_time AS t,
                        ST_Y(a.geom) AS lat, ST_X(a.geom) AS lon,
                        ST_Distance(a.geom::geography, b.geom::geography) AS distance_m
                    FROM recent a
                    JOIN recent b
                      ON a.mmsi < b.mmsi
                     AND ABS(EXTRACT(EPOCH FROM (a.position_time - b.position_time))) <= :time_window_s
                     AND ST_DWithin(a.geom::geography, b.geom::geography, :distance_m)
                )
                SELECT
                    mmsi_a, mmsi_b,
                    MIN(t) AS first_seen, MAX(t) AS last_seen,
                    COUNT(*) AS sample_count,
                    MIN(distance_m) AS min_distance_m,
                    AVG(lat) AS avg_lat, AVG(lon) AS avg_lon
                FROM pairs
                GROUP BY mmsi_a, mmsi_b
                HAVING EXTRACT(EPOCH FROM (MAX(t) - MIN(t))) / 60.0 >= :min_duration_minutes
                ORDER BY first_seen DESC
                LIMIT :limit
            """),
            {
                "date_from": date_from,
                "date_to": date_to,
                "distance_m": distance_m,
                "time_window_s": time_window_s,
                "min_duration_minutes": min_duration_minutes,
                "limit": limit,
            },
        )
    ).all()

    if not rows:
        return [], date_from, date_to

    mmsis = sorted({r.mmsi_a for r in rows} | {r.mmsi_b for r in rows})
    vessel_rows = (
        await db.execute(
            text("""
                SELECT v.mmsi, v.name, st.group_name
                FROM ais_vessel_static v
                LEFT JOIN ais_ship_type st ON v.ship_type_code = st.code
                WHERE v.mmsi = ANY(:mmsis)
            """),
            {"mmsis": mmsis},
        )
    ).all()
    vessel_info = {r.mmsi: (r.name, r.group_name) for r in vessel_rows}

    summaries = []
    for r in rows:
        name_a, type_a = vessel_info.get(r.mmsi_a, (None, None))
        name_b, type_b = vessel_info.get(r.mmsi_b, (None, None))
        duration_minutes = (r.last_seen - r.first_seen).total_seconds() / 60.0
        summaries.append(
            EncounterSummary(
                id=f"{r.mmsi_a}:{r.mmsi_b}:{int(r.first_seen.timestamp())}",
                mmsi_a=r.mmsi_a,
                mmsi_b=r.mmsi_b,
                name_a=name_a,
                name_b=name_b,
                ship_type_a=type_a,
                ship_type_b=type_b,
                first_seen=r.first_seen,
                last_seen=r.last_seen,
                duration_minutes=round(duration_minutes, 1),
                sample_count=r.sample_count,
                min_distance_m=round(r.min_distance_m, 1),
                avg_lat=r.avg_lat,
                avg_lon=r.avg_lon,
            )
        )

    return summaries, date_from, date_to


async def get_encounter_detail(
    db: AsyncSession,
    mmsi_a: int,
    mmsi_b: int,
    date_from: datetime,
    date_to: datetime,
    distance_m: float = 500,
    time_window_s: int = 600,
) -> EncounterDetail | None:
    rows = (
        await db.execute(
            text("""
                WITH recent AS (
                    SELECT mmsi, position_time, geom
                    FROM ais_position
                    WHERE position_time BETWEEN :date_from AND :date_to
                      AND mmsi IN (:mmsi_a, :mmsi_b)
                      AND geom IS NOT NULL
                )
                SELECT
                    a.position_time AS t,
                    ST_Y(a.geom) AS lat_a, ST_X(a.geom) AS lon_a,
                    ST_Y(b.geom) AS lat_b, ST_X(b.geom) AS lon_b,
                    ST_Distance(a.geom::geography, b.geom::geography) AS distance_m
                FROM recent a
                JOIN recent b
                  ON a.mmsi = :mmsi_a AND b.mmsi = :mmsi_b
                 AND ABS(EXTRACT(EPOCH FROM (a.position_time - b.position_time))) <= :time_window_s
                 AND ST_DWithin(a.geom::geography, b.geom::geography, :distance_m)
                ORDER BY a.position_time
            """),
            {
                "date_from": date_from,
                "date_to": date_to,
                "mmsi_a": mmsi_a,
                "mmsi_b": mmsi_b,
                "time_window_s": time_window_s,
                "distance_m": distance_m,
            },
        )
    ).all()

    if not rows:
        return None

    vessel_rows = (
        await db.execute(
            text("""
                SELECT v.mmsi, v.name, st.group_name
                FROM ais_vessel_static v
                LEFT JOIN ais_ship_type st ON v.ship_type_code = st.code
                WHERE v.mmsi = ANY(:mmsis)
            """),
            {"mmsis": [mmsi_a, mmsi_b]},
        )
    ).all()
    vessel_info = {r.mmsi: (r.name, r.group_name) for r in vessel_rows}
    name_a, type_a = vessel_info.get(mmsi_a, (None, None))
    name_b, type_b = vessel_info.get(mmsi_b, (None, None))

    track = [
        EncounterTrackPoint(
            time=r.t, lat_a=r.lat_a, lon_a=r.lon_a, lat_b=r.lat_b, lon_b=r.lon_b,
            distance_m=round(r.distance_m, 1),
        )
        for r in rows
    ]
    first_seen = rows[0].t
    last_seen = rows[-1].t
    min_distance = min(r.distance_m for r in rows)
    avg_lat = sum(r.lat_a for r in rows) / len(rows)
    avg_lon = sum(r.lon_a for r in rows) / len(rows)

    return EncounterDetail(
        id=f"{mmsi_a}:{mmsi_b}:{int(first_seen.timestamp())}",
        mmsi_a=mmsi_a,
        mmsi_b=mmsi_b,
        name_a=name_a,
        name_b=name_b,
        ship_type_a=type_a,
        ship_type_b=type_b,
        first_seen=first_seen,
        last_seen=last_seen,
        duration_minutes=round((last_seen - first_seen).total_seconds() / 60.0, 1),
        sample_count=len(rows),
        min_distance_m=round(min_distance, 1),
        avg_lat=avg_lat,
        avg_lon=avg_lon,
        track=track,
    )
