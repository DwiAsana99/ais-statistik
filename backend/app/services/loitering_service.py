"""Loitering detection — algoritma P1 (lihat D:\\Project\\ais-statistik\\loitering.md).

Trajektori 4-jam per MMSI -> cleaning -> fitur -> label
(avg_sog < 2kn AND durasi > 2 jam AND avg_jarak_pelabuhan > 20nm).

Adaptasi dari spesifikasi asli (yang mengasumsikan file Parquet/CSV ±230 juta baris):
- Sumber data: PostgreSQL `ais_position` (~41 juta baris, indeks (mmsi, position_time)).
- Skala kita jauh lebih kecil (~5.000 kapal), jadi ekstraksi trajektori + cleaning + fitur
  SOG/COG dihitung langsung via window function SQL (bukan partisi file work/parts/*.parquet
  + loop per-MMSI di Python seperti draf awal). Ini tetap "per-MMSI" secara logis (PARTITION BY
  mmsi) dan memakai index composite yang sudah ada.
- Jarak ke pelabuhan (avg_dist_port_km) baru dihitung di Python untuk trajektori yang SUDAH lolos
  filter avg_sog & durasi (2-pass) — menghindari hitung haversine utk semua trajektori yang jelas
  bukan kandidat loitering.
"""

import csv
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.schemas.behavior import LoiteringEvent, LoiteringDetail, LoiteringTrackPoint

_EARTH_R_KM = 6371.0088
_ports_cache: np.ndarray | None = None


def _load_ports() -> np.ndarray:
    """Muat data/ports.csv sekali, cache di memori (radians, siap dipakai haversine)."""
    global _ports_cache
    if _ports_cache is not None:
        return _ports_cache

    settings = get_settings()
    path = Path(settings.loitering_ports_file)
    if not path.is_absolute():
        path = Path.cwd() / path

    lats: list[float] = []
    lons: list[float] = []
    with open(path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            lats.append(float(row["lat"]))
            lons.append(float(row["lon"]))

    _ports_cache = np.radians(np.column_stack([lats, lons]))
    return _ports_cache


_DIST_BATCH_SIZE = 4000  # cap n_points x n_ports matrix per batch (~4000x3630x8B <= ~120MB)


def _nearest_port_dist_km(lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    """Jarak haversine tiap titik ke pelabuhan terdekat — vektorisasi (n_titik x n_pelabuhan)."""
    ports_rad = _load_ports()
    pts_rad = np.radians(np.column_stack([lats, lons]))

    lat1 = pts_rad[:, 0:1]
    lon1 = pts_rad[:, 1:2]
    lat2 = ports_rad[:, 0]
    lon2 = ports_rad[:, 1]

    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    c = 2 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))
    return (_EARTH_R_KM * c).min(axis=1)


def _avg_nearest_port_dist_km(lats: np.ndarray, lons: np.ndarray) -> float:
    """Rata-rata jarak ke pelabuhan terdekat, diproses per-batch supaya trajektori dengan
    puluhan ribu titik (kapal yang lama sekali diam) tidak meledak memori (n_titik x 3630 pelabuhan)."""
    n = len(lats)
    total = 0.0
    for i in range(0, n, _DIST_BATCH_SIZE):
        batch_dist = _nearest_port_dist_km(lats[i : i + _DIST_BATCH_SIZE], lons[i : i + _DIST_BATCH_SIZE])
        total += float(batch_dist.sum())
    return total / n


def _clamp_window(date_from: datetime | None, date_to: datetime | None) -> tuple[datetime, datetime]:
    settings = get_settings()
    now = datetime.utcnow()
    if date_to is None:
        date_to = now
    if date_from is None:
        date_from = date_to - timedelta(days=settings.loitering_lookback_days_default)
    max_span = timedelta(days=settings.loitering_lookback_days_max)
    if date_to - date_from > max_span:
        date_from = date_to - max_span
    return date_from, date_to


async def detect_loitering(
    db: AsyncSession,
    date_from: datetime | None,
    date_to: datetime | None,
    avg_sog_kn_lt: float | None = None,
    duration_h_gt: float | None = None,
    avg_dist_port_km_gt: float | None = None,
    limit: int = 200,
) -> tuple[list[LoiteringEvent], datetime, datetime]:
    settings = get_settings()
    avg_sog_kn_lt = settings.loitering_avg_sog_kn_lt if avg_sog_kn_lt is None else avg_sog_kn_lt
    duration_h_gt = settings.loitering_duration_h_gt if duration_h_gt is None else duration_h_gt
    avg_dist_port_km_gt = (
        settings.loitering_avg_dist_port_km_gt if avg_dist_port_km_gt is None else avg_dist_port_km_gt
    )
    date_from, date_to = _clamp_window(date_from, date_to)

    stationary_expr = (
        "(sog_std < :sog_std_max AND cog_std <= :cog_std_eps)"
        if settings.loitering_drop_logic == "and"
        else "(sog_std < :sog_std_max OR cog_std <= :cog_std_eps)"
    )

    # Pass 1: cleansing + ekstraksi trajektori (gap > gap_hours) + cleaning trajektori
    # (min_points, buang "stationary-like") + pre-filter avg_sog & durasi — semua di SQL,
    # jauh lebih murah daripada menghitung jarak pelabuhan utk trajektori yg jelas gagal.
    candidate_rows = (
        await db.execute(
            text(f"""
                WITH cleansed AS (
                    SELECT mmsi, position_time,
                           lat::float AS lat, lon::float AS lon,
                           sog_knots::float AS sog, cog_deg::float AS cog
                    FROM ais_position
                    WHERE position_time BETWEEN :date_from AND :date_to
                      AND mmsi IS NOT NULL
                      AND lat BETWEEN -90 AND 90
                      AND lon BETWEEN -180 AND 180
                      AND sog_knots::float BETWEEN :sog_min AND :sog_max
                      AND cog_deg::float >= 0 AND cog_deg::float < 360
                ),
                lagged AS (
                    SELECT *, LAG(position_time) OVER w AS prev_time
                    FROM cleansed
                    WINDOW w AS (PARTITION BY mmsi ORDER BY position_time)
                ),
                gapped AS (
                    SELECT *,
                        SUM(CASE WHEN
                                prev_time IS NULL
                             OR EXTRACT(EPOCH FROM position_time - prev_time) > :gap_seconds
                            THEN 1 ELSE 0 END) OVER (PARTITION BY mmsi ORDER BY position_time) AS traj_grp
                    FROM lagged
                ),
                traj AS (
                    SELECT
                        mmsi, traj_grp,
                        COUNT(*)                    AS n_points,
                        MIN(position_time)          AS t_start,
                        MAX(position_time)          AS t_end,
                        AVG(sog)                    AS avg_sog,
                        STDDEV_POP(sog)              AS sog_std,
                        STDDEV_POP(cog)              AS cog_std,
                        AVG(lat)                     AS lat_mean,
                        AVG(lon)                     AS lon_mean,
                        EXTRACT(EPOCH FROM MAX(position_time) - MIN(position_time)) / 3600.0
                                                     AS duration_h
                    FROM gapped
                    GROUP BY mmsi, traj_grp
                    HAVING COUNT(*) >= :min_points
                )
                SELECT mmsi, t_start, t_end, n_points, avg_sog, lat_mean, lon_mean, duration_h
                FROM traj
                WHERE NOT {stationary_expr}
                  AND avg_sog < :avg_sog_lt
                  AND duration_h > :duration_h_gt
                ORDER BY duration_h DESC
                LIMIT :candidate_limit
            """),
            {
                "date_from": date_from,
                "date_to": date_to,
                "sog_min": settings.loitering_sog_range[0],
                "sog_max": settings.loitering_sog_range[1],
                "gap_seconds": settings.loitering_gap_hours * 3600,
                "min_points": settings.loitering_min_points,
                "sog_std_max": settings.loitering_sog_std_max,
                "cog_std_eps": settings.loitering_cog_std_eps,
                "avg_sog_lt": avg_sog_kn_lt,
                "duration_h_gt": duration_h_gt,
                "candidate_limit": max(limit * 5, 500),
            },
        )
    ).all()

    if not candidate_rows:
        return [], date_from, date_to

    # Pass 2: hanya utk kandidat lolos pass 1 — ambil titik asli & hitung avg_dist_port_km.
    events: list[LoiteringEvent] = []
    for row in candidate_rows:
        pts = (
            await db.execute(
                text("""
                    SELECT lat::float, lon::float
                    FROM ais_position
                    WHERE mmsi = :mmsi
                      AND position_time BETWEEN :t_start AND :t_end
                      AND lat IS NOT NULL AND lon IS NOT NULL
                """),
                {"mmsi": row.mmsi, "t_start": row.t_start, "t_end": row.t_end},
            )
        ).all()
        if not pts:
            continue
        lats = np.array([p[0] for p in pts])
        lons = np.array([p[1] for p in pts])
        avg_dist_port_km = _avg_nearest_port_dist_km(lats, lons)

        if avg_dist_port_km <= avg_dist_port_km_gt:
            continue

        events.append((row, avg_dist_port_km))

    events.sort(key=lambda e: e[0].duration_h, reverse=True)
    events = events[:limit]

    if not events:
        return [], date_from, date_to

    mmsis = list({e[0].mmsi for e in events})
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
    vessel_map = {r[0]: (r[1], r[2]) for r in vessel_rows}

    result = []
    for row, dist_km in events:
        vessel_name, ship_type = vessel_map.get(row.mmsi, (None, None))
        result.append(
            LoiteringEvent(
                id=f"{row.mmsi}:{int(row.t_start.timestamp())}:{int(row.t_end.timestamp())}",
                mmsi=row.mmsi,
                vessel_name=vessel_name,
                ship_type=ship_type,
                start_time=row.t_start,
                end_time=row.t_end,
                duration_minutes=round(float(row.duration_h) * 60, 1),
                centroid_lat=float(row.lat_mean),
                centroid_lon=float(row.lon_mean),
                avg_sog=round(float(row.avg_sog), 3),
                point_count=int(row.n_points),
                avg_dist_port_km=round(dist_km, 2),
            )
        )
    return result, date_from, date_to


async def get_loitering_detail(db: AsyncSession, event_id: str) -> LoiteringDetail | None:
    try:
        mmsi_str, start_str, end_str = event_id.split(":")
        mmsi = int(mmsi_str)
        t_start = datetime.fromtimestamp(int(start_str), tz=timezone.utc)
        t_end = datetime.fromtimestamp(int(end_str), tz=timezone.utc)
    except (ValueError, IndexError):
        return None

    track_rows = (
        await db.execute(
            text("""
                SELECT position_time, lat::float, lon::float, sog_knots::float AS sog
                FROM ais_position
                WHERE mmsi = :mmsi
                  AND position_time BETWEEN :t_start AND :t_end
                  AND lat IS NOT NULL AND lon IS NOT NULL
                ORDER BY position_time
                LIMIT 2000
            """),
            {"mmsi": mmsi, "t_start": t_start, "t_end": t_end},
        )
    ).all()
    if not track_rows:
        return None

    track = [
        LoiteringTrackPoint(
            time=r[0], lat=float(r[1]), lon=float(r[2]),
            sog=round(float(r[3]), 3) if r[3] is not None else 0.0,
        )
        for r in track_rows
    ]

    lats = np.array([p.lat for p in track])
    lons = np.array([p.lon for p in track])
    sogs = [p.sog for p in track]
    avg_dist_port_km = _avg_nearest_port_dist_km(lats, lons)

    vessel_row = (
        await db.execute(
            text("""
                SELECT v.name, st.group_name
                FROM ais_vessel_static v
                LEFT JOIN ais_ship_type st ON v.ship_type_code = st.code
                WHERE v.mmsi = :mmsi
            """),
            {"mmsi": mmsi},
        )
    ).first()
    vessel_name, ship_type = vessel_row if vessel_row else (None, None)

    duration_min = (track[-1].time - track[0].time).total_seconds() / 60.0

    return LoiteringDetail(
        id=event_id,
        mmsi=mmsi,
        vessel_name=vessel_name,
        ship_type=ship_type,
        start_time=track[0].time,
        end_time=track[-1].time,
        duration_minutes=round(duration_min, 1),
        centroid_lat=float(lats.mean()),
        centroid_lon=float(lons.mean()),
        avg_sog=round(sum(sogs) / len(sogs), 3),
        point_count=len(track),
        avg_dist_port_km=round(avg_dist_port_km, 2),
        track=track,
    )
