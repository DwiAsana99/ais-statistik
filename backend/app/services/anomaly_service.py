"""Deteksi anomali AIS — A0 (kualitas/identitas), A1 (lompatan & SOG mismatch),
A2 (duplikasi identitas MMSI), A3 (AIS gap / dark activity).
Lihat D:\\Project\\ais-statistik\\ANOMALY_ALGORITHM.md.

A1/A2/A3 menghasilkan kejadian diskret -> disimpan permanen ke anomaly_events
(upsert via natural key mmsi+type+detector+t_start).

A0 (sentinel SOG/COG, lat/lon per titik) BUKAN kejadian diskret — volumenya besar
(puluhan ribu/hari) dan sifatnya agregat kualitas data, bukan "insiden" satu-satu.
Karena itu A0 dihitung on-demand sebagai ringkasan, tidak disimpan ke anomaly_events.

Performa: A1+A2+A3 digabung dalam SATU pass per-MMSI (satu fetch posisi per kapal),
bukan tiga fetch terpisah — lihat catatan performa Fase 12b (setiap fetch = 1 round
trip jaringan ke DB remote; menriplikasi itu akan mentriplikasi durasi worker).
A3 butuh info lintas-kapal (kapal lain di sel yang sama) yang dibangun dari data
yang SAMA yang sudah di-fetch untuk A1/A2 (disimpan sementara di memori), bukan
query terpisah.
"""
import json
import math
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

DETECTOR_A1 = "A1.v1"
DETECTOR_A2 = "A2.v1"
DETECTOR_A3 = "A3.v1"
PLACEHOLDER_SUFFIXES = ("000000", "999999")

KM_PER_NM = 1.852
EARTH_R_KM = 6371.0088

# [ADAPT] ANOMALY_ALGORITHM.md Bagian 9 config.yaml — lihat dokumen utk rasional angka ini
V_MAX_KN = 60.0
MIN_JUMP_KM = 1.0
MISMATCH_MAX_DT_S = 600.0
MISMATCH_TOL_KN = 10.0
SOG_NA = 102.3
COG_NA = 360.0

# A2 — identity.min_msgs_per_track / min_overlap_h.
# [ADAPT-2026-09-20] Dinaikkan dari default dokumen (5) ke 30 setelah uji coba live:
# dengan 5, ~58 kandidat muncul tapi mayoritas track_sizes-nya spt [7620,41,7,5] —
# satu kapal asli + "trek hantu" 5-40 titik dari titik korup (efek yg sama dgn A1
# isolated_outlier yg belum difilter). 30 tidak menghilangkan noise ini sepenuhnya
# (butuh klasifikasi isolated_outlier di A1 dulu utk fix yg benar) tapi mengurangi
# secara signifikan tanpa membuang kasus dgn trek berimbang (mis. 871/932, 1389/1102).
MIN_MSGS_PER_TRACK = 30
MIN_OVERLAP_H = 0.5

# A3 — gap.naive_min_s [PARAM]. Median interval lapor lokal ~10s, p99 ~540s (9 menit)
# (diukur langsung dari data kita, lihat audit Fase 12) -> 1800s (30 menit) aman di atas noise.
GAP_NAIVE_MIN_S = 1800.0
RECEPTION_CELL_DEG = 0.1
RECEPTION_MIN_UNIQUE = 3
# [ADAPT-2026-09-20] Ditambahkan setelah uji coba live: tanpa syarat durasi minimum,
# "likely_intentional" banyak terpicu oleh gap PENDEK (~30-60 menit) dgn disp_km~0
# di area ramai (mis. dekat pelabuhan, puluhan kapal lain terlihat) — itu cuma jeda
# lapor wajar saat kapal diam, bukan aktivitas gelap. Syarat durasi >= 2 jam
# menyaring noise ini; kandidat sengaja jadi lebih berarti (durasi substansial DAN
# area tetap tercakup).
INTENTIONAL_MIN_GAP_H = 2.0


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (lat1, lon1, lat2, lon2))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return EARTH_R_KM * 2 * math.asin(math.sqrt(min(1, a)))


async def get_a0_summary(db: AsyncSession, lookback_days: int = 7) -> dict:
    mmsi_rows = (await db.execute(text("SELECT mmsi FROM ais_vessel_static"))).all()
    all_mmsi = [r[0] for r in mmsi_rows]
    mmsi_invalid = [m for m in all_mmsi if len(str(m)) != 9]
    mmsi_placeholder = [m for m in all_mmsi if str(m).endswith(PLACEHOLDER_SUFFIXES)]

    since = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    active_rows = (
        await db.execute(
            text("SELECT mmsi FROM vessel_states WHERE last_received_at >= :since"),
            {"since": since},
        )
    ).all()
    active_mmsi = [r[0] for r in active_rows]

    n_points = n_sog_na = n_cog_na = n_latlon_bad = 0
    for mmsi in active_mmsi:
        row = (
            await db.execute(
                text("""
                    SELECT
                        COUNT(*),
                        COUNT(*) FILTER (WHERE sog_knots::float >= :sog_na),
                        COUNT(*) FILTER (WHERE cog_deg::float >= :cog_na),
                        COUNT(*) FILTER (
                            WHERE lat NOT BETWEEN -90 AND 90 OR lon NOT BETWEEN -180 AND 180
                        )
                    FROM ais_position
                    WHERE mmsi = :mmsi AND position_time >= :since
                """),
                {"mmsi": mmsi, "since": since, "sog_na": SOG_NA, "cog_na": COG_NA},
            )
        ).first()
        n_points += row[0] or 0
        n_sog_na += row[1] or 0
        n_cog_na += row[2] or 0
        n_latlon_bad += row[3] or 0

    return {
        "total_mmsi_registered": len(all_mmsi),
        "mmsi_invalid_count": len(mmsi_invalid),
        "mmsi_placeholder_count": len(mmsi_placeholder),
        "n_vessels_active": len(active_mmsi),
        "lookback_days": lookback_days,
        "n_points_total": n_points,
        "n_sog_na": n_sog_na,
        "n_cog_na": n_cog_na,
        "n_latlon_bad": n_latlon_bad,
    }


def _detect_a1_for_vessel(mmsi: int, rows: list[tuple]) -> list[dict]:
    events = []
    prev = rows[0]
    for row in rows[1:]:
        t, lat, lon, sog = row
        pt, plat, plon, _psog = prev
        dt_s = (t - pt).total_seconds()
        if dt_s >= 1 and sog is not None:
            d_km = _haversine_km(plat, plon, lat, lon)
            v_imp_kn = d_km / KM_PER_NM / (dt_s / 3600)

            if d_km >= MIN_JUMP_KM and v_imp_kn > V_MAX_KN:
                events.append({
                    "mmsi": mmsi, "type": "JUMP", "detector": DETECTOR_A1,
                    "t_start": t, "t_end": None, "lat": lat, "lon": lon,
                    "score": v_imp_kn, "severity": "data_quality",
                    "evidence": {
                        "v_imp_kn": round(v_imp_kn, 1),
                        "dist_km": round(d_km, 1),
                        "dt_s": round(dt_s, 1),
                    },
                })

            if dt_s <= MISMATCH_MAX_DT_S and d_km >= MIN_JUMP_KM:
                diff = abs(sog - v_imp_kn)
                if diff > MISMATCH_TOL_KN:
                    events.append({
                        "mmsi": mmsi, "type": "SOG_MISMATCH", "detector": DETECTOR_A1,
                        "t_start": t, "t_end": None, "lat": lat, "lon": lon,
                        "score": diff, "severity": "data_quality",
                        "evidence": {
                            "sog_kn": round(sog, 1),
                            "v_imp_kn": round(v_imp_kn, 1),
                            "diff_kn": round(diff, 1),
                            "dt_s": round(dt_s, 1),
                        },
                    })
        prev = row
    return events


def _detect_a2_for_vessel(mmsi: int, rows: list[tuple]) -> list[dict]:
    """GFW-style: kelompokkan pesan MMSI ini jadi >=1 'trek' fisik. Tiap pesan masuk
    ke trek yang bisa dijangkau (v_imp <= V_MAX_KN) dengan dt terkecil; kalau tidak
    ada yang bisa dijangkau, itu trek baru. >=2 trek besar & waktunya tumpang-tindih
    => satu MMSI dipakai >=2 entitas fisik berbeda secara bersamaan."""
    tracks: list[dict] = []
    for t, lat, lon, _sog in rows:
        candidates = []
        for tr in tracks:
            dt_s = (t - tr["last_t"]).total_seconds()
            if dt_s <= 0:
                continue
            d_km = _haversine_km(tr["last_lat"], tr["last_lon"], lat, lon)
            v_imp = d_km / KM_PER_NM / (dt_s / 3600)
            if v_imp <= V_MAX_KN:
                candidates.append((tr, dt_s))
        if candidates:
            tr = min(candidates, key=lambda c: c[1])[0]
            tr["last_t"], tr["last_lat"], tr["last_lon"], tr["n"] = t, lat, lon, tr["n"] + 1
        else:
            tracks.append({"first_t": t, "last_t": t, "last_lat": lat, "last_lon": lon, "n": 1})

    valid = [tr for tr in tracks if tr["n"] >= MIN_MSGS_PER_TRACK]
    if len(valid) < 2:
        return []

    max_overlap_h = 0.0
    for i in range(len(valid)):
        for j in range(i + 1, len(valid)):
            a, b = valid[i], valid[j]
            overlap_start = max(a["first_t"], b["first_t"])
            overlap_end = min(a["last_t"], b["last_t"])
            overlap_h = (overlap_end - overlap_start).total_seconds() / 3600
            max_overlap_h = max(max_overlap_h, overlap_h)

    if max_overlap_h < MIN_OVERLAP_H:
        return []

    t_start = min(tr["first_t"] for tr in valid)
    t_end = max(tr["last_t"] for tr in valid)
    return [{
        "mmsi": mmsi, "type": "MMSI_DUPLICATE", "detector": DETECTOR_A2,
        "t_start": t_start, "t_end": t_end,
        "lat": valid[0]["last_lat"], "lon": valid[0]["last_lon"],
        "score": float(len(valid)), "severity": "suspicious",
        "evidence": {
            "n_tracks": len(valid),
            "track_sizes": [tr["n"] for tr in valid],
            "max_overlap_h": round(max_overlap_h, 2),
        },
    }]


def _cell_key(lat: float, lon: float, t: datetime, cell_deg: float = RECEPTION_CELL_DEG):
    hour = t.replace(minute=0, second=0, microsecond=0)
    return (round(lat / cell_deg), round(lon / cell_deg), hour)


def _build_reception_map(vessel_rows: dict[int, list[tuple]]) -> dict:
    """reception_ok(cell,hour) data-driven — TANPA koordinat receiver (kita tidak
    punya, lihat audit Fase 12b): proxy-nya kapal LAIN yang juga terlihat di sel yang
    sama pada jam yang sama, langsung dari ais_position kita sendiri."""
    m: dict = {}
    for mmsi, rows in vessel_rows.items():
        for t, lat, lon, _sog in rows:
            key = _cell_key(lat, lon, t)
            m.setdefault(key, set()).add(mmsi)
    return m


def _detect_a3_for_vessel(mmsi: int, rows: list[tuple], reception_map: dict) -> list[dict]:
    """AIS gap. [ADAPT] dari ANOMALY_ALGORITHM.md A3 — kriteria "jarak ke receiver
    terdekat" DIHILANGKAN (tidak ada koordinat receiver di database kita, lihat
    audit Fase 12b). Sebagai gantinya: kandidat "sengaja" kalau kapal LAIN tetap
    terlihat di sel yang sama sebelum & selama gap (area tetap "hidup", bukan
    receiver padam) DAN kepadatan lalu lintas di sel itu cukup (reception_min_unique)."""
    events = []
    for i in range(1, len(rows)):
        t0, lat0, lon0, _sog0 = rows[i - 1]
        t1, lat1, lon1, _sog1 = rows[i]
        gap_s = (t1 - t0).total_seconds()
        if gap_s <= GAP_NAIVE_MIN_S:
            continue

        gap_h = gap_s / 3600
        disp_km = _haversine_km(lat0, lon0, lat1, lon1)

        others_before = reception_map.get(_cell_key(lat0, lon0, t0), set()) - {mmsi}
        others_during: set = set()
        n_hours = max(1, int(gap_h))
        for h in range(n_hours):
            sample_t = t0 + timedelta(hours=h + 0.5)
            others_during |= reception_map.get(_cell_key(lat0, lon0, sample_t), set()) - {mmsi}

        reception_ok_before = len(others_before) >= RECEPTION_MIN_UNIQUE
        area_stayed_covered = len(others_during) >= 1
        likely_intentional = (
            reception_ok_before and area_stayed_covered and gap_h >= INTENTIONAL_MIN_GAP_H
        )

        events.append({
            "mmsi": mmsi, "type": "AIS_GAP", "detector": DETECTOR_A3,
            "t_start": t0, "t_end": t1, "lat": lat0, "lon": lon0,
            "score": gap_h,
            "severity": "suspicious" if likely_intentional else "unusual",
            "evidence": {
                "gap_h": round(gap_h, 2),
                "disp_km": round(disp_km, 2),
                "others_seen_before": len(others_before),
                "others_seen_during": len(others_during),
                "likely_intentional": likely_intentional,
            },
        })
    return events


async def detect_all(db: AsyncSession, lookback_days: int = 7) -> list[dict]:
    """Orkestrasi A1+A2+A3 dalam satu pass per-MMSI. Lihat docstring modul."""
    since = datetime.now(timezone.utc) - timedelta(days=lookback_days)

    mmsi_rows = (await db.execute(text("SELECT mmsi FROM ais_vessel_static"))).all()
    all_mmsi = [r[0] for r in mmsi_rows]
    excluded = {m for m in all_mmsi if len(str(m)) != 9 or str(m).endswith(PLACEHOLDER_SUFFIXES)}

    vessel_data: dict[int, list[tuple]] = {}
    events: list[dict] = []

    for mmsi in all_mmsi:
        if mmsi in excluded:
            continue
        rows = (
            await db.execute(
                text("""
                    SELECT position_time, lat::float, lon::float, sog_knots::float
                    FROM ais_position
                    WHERE mmsi = :mmsi AND position_time >= :since
                      AND lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180
                    ORDER BY position_time
                """),
                {"mmsi": mmsi, "since": since},
            )
        ).all()
        if len(rows) < 2:
            continue

        vessel_data[mmsi] = rows
        events += _detect_a1_for_vessel(mmsi, rows)
        events += _detect_a2_for_vessel(mmsi, rows)

    # A3 butuh peta kehadiran lintas-kapal -> baru bisa dibangun setelah semua
    # kapal ter-fetch. Tidak ada query DB tambahan (pakai vessel_data yang sudah di memori).
    reception_map = _build_reception_map(vessel_data)
    for mmsi, rows in vessel_data.items():
        events += _detect_a3_for_vessel(mmsi, rows, reception_map)

    if not events:
        return events

    mmsis = list({e["mmsi"] for e in events})
    name_rows = (
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
    vessel_map = {r[0]: (r[1], r[2]) for r in name_rows}
    for e in events:
        vessel_name, ship_type = vessel_map.get(e["mmsi"], (None, None))
        e["vessel_name"] = vessel_name
        e["ship_type"] = ship_type

    return events


async def save_events(db: AsyncSession, events: list[dict]) -> int:
    if not events:
        return 0
    for e in events:
        await db.execute(
            text("""
                INSERT INTO anomaly_events
                    (mmsi, vessel_name, ship_type, type, detector, t_start, t_end, lat, lon,
                     score, severity, evidence, status)
                VALUES
                    (:mmsi, :vessel_name, :ship_type, :type, :detector, :t_start, :t_end, :lat, :lon,
                     :score, :severity, CAST(:evidence AS JSONB), 'candidate')
                ON CONFLICT (mmsi, type, detector, t_start)
                DO UPDATE SET
                    last_seen_at = now(),
                    t_end = EXCLUDED.t_end,
                    score = EXCLUDED.score,
                    evidence = EXCLUDED.evidence,
                    vessel_name = EXCLUDED.vessel_name,
                    ship_type = EXCLUDED.ship_type
            """),
            {
                "mmsi": e["mmsi"],
                "vessel_name": e.get("vessel_name"),
                "ship_type": e.get("ship_type"),
                "type": e["type"],
                "detector": e["detector"],
                "t_start": e["t_start"],
                "t_end": e.get("t_end"),
                "lat": e["lat"],
                "lon": e["lon"],
                "score": e["score"],
                "severity": e["severity"],
                "evidence": json.dumps(e["evidence"]),
            },
        )
    await db.commit()
    return len(events)


async def list_events(
    db: AsyncSession,
    type_: str | None = None,
    limit: int = 200,
) -> list[dict]:
    where = "WHERE status = 'candidate'"
    params: dict = {"limit": limit}
    if type_:
        where += " AND type = :type"
        params["type"] = type_

    rows = (
        await db.execute(
            text(f"""
                SELECT id, mmsi, vessel_name, ship_type, type, detector, t_start, t_end,
                       lat, lon, score, severity, status, evidence
                FROM anomaly_events
                {where}
                ORDER BY t_start DESC
                LIMIT :limit
            """),
            params,
        )
    ).all()
    return [
        {
            "id": r[0], "mmsi": r[1], "vessel_name": r[2], "ship_type": r[3],
            "type": r[4], "detector": r[5], "t_start": r[6], "t_end": r[7],
            "lat": r[8], "lon": r[9], "score": r[10], "severity": r[11],
            "status": r[12], "evidence": r[13],
        }
        for r in rows
    ]


async def get_summary(db: AsyncSession) -> dict:
    rows = (
        await db.execute(
            text("""
                SELECT type, COUNT(*)
                FROM anomaly_events
                WHERE status = 'candidate'
                GROUP BY type
                ORDER BY COUNT(*) DESC
            """)
        )
    ).all()
    last_run = (
        await db.execute(text("SELECT MAX(last_seen_at) FROM anomaly_events"))
    ).scalar()
    total = sum(r[1] for r in rows)
    return {
        "total_events": total,
        "by_type": [{"type": r[0], "count": r[1]} for r in rows],
        "last_run_at": last_run,
    }
