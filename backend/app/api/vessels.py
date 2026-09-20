import hashlib
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, cast, Text, text

from app.database import get_db
from app.cache import cache_get, cache_set
from app.models.vessel import AisVesselStatic, VesselState
from app.models.reference import AisShipType, AisNavStatus
from app.schemas.vessel import VesselListItem, VesselDetail, VesselTrackPoint

router = APIRouter(prefix="/api/vessels", tags=["vessels"])


@router.get("", response_model=dict)
async def list_vessels(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str = Query(None),
    ship_type: str = Query(None),
    sort_by: str = Query("name"),
    sort_order: str = Query("asc"),
    db: AsyncSession = Depends(get_db),
):
    base = (
        select(
            AisVesselStatic.mmsi,
            AisVesselStatic.name,
            AisVesselStatic.call_sign,
            AisVesselStatic.imo,
            AisVesselStatic.ship_type_code,
            AisShipType.group_name.label("ship_type_group"),
            AisVesselStatic.length_m,
            AisVesselStatic.width_m,
            AisVesselStatic.draught_m,
            AisVesselStatic.destination,
            VesselState.last_lat,
            VesselState.last_lon,
            VesselState.last_sog,
            AisNavStatus.name.label("last_nav_status"),
            VesselState.last_received_at.label("last_update"),
        )
        .outerjoin(AisShipType, AisVesselStatic.ship_type_code == AisShipType.code)
        .outerjoin(VesselState, AisVesselStatic.mmsi == VesselState.mmsi)
        .outerjoin(AisNavStatus, VesselState.last_nav_status == AisNavStatus.code)
    )

    if search:
        term = f"%{search}%"
        base = base.where(
            or_(
                AisVesselStatic.name.ilike(term),
                AisVesselStatic.call_sign.ilike(term),
                cast(AisVesselStatic.mmsi, Text).ilike(term),
            )
        )

    if ship_type:
        base = base.where(AisShipType.group_name == ship_type)

    sort_col_map = {
        "name": AisVesselStatic.name,
        "mmsi": AisVesselStatic.mmsi,
        "ship_type": AisShipType.group_name,
        "length": AisVesselStatic.length_m,
        "last_update": VesselState.last_received_at,
    }
    sort_col = sort_col_map.get(sort_by, AisVesselStatic.name)
    if sort_order == "desc":
        sort_col = sort_col.desc().nullslast()
    else:
        sort_col = sort_col.asc().nullslast()

    count_q = select(func.count()).select_from(base.subquery())
    total = await db.scalar(count_q) or 0

    rows = (
        await db.execute(
            base.order_by(sort_col)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()

    items = [
        VesselListItem(
            mmsi=r.mmsi,
            name=r.name,
            call_sign=r.call_sign,
            imo=r.imo,
            ship_type_code=r.ship_type_code,
            ship_type_group=r.ship_type_group,
            length_m=float(r.length_m) if r.length_m else None,
            width_m=float(r.width_m) if r.width_m else None,
            draught_m=float(r.draught_m) if r.draught_m else None,
            destination=r.destination,
            last_lat=r.last_lat,
            last_lon=r.last_lon,
            last_sog=r.last_sog,
            last_nav_status=r.last_nav_status,
            last_update=r.last_update,
        )
        for r in rows
    ]

    total_pages = (total + page_size - 1) // page_size

    return {
        "items": [i.model_dump() for i in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


MAX_TRACK_HOURS = 48
MAX_TRACK_POINTS = 2000


@router.get("/{mmsi}/track", response_model=list[VesselTrackPoint])
async def get_vessel_track(
    mmsi: int,
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.utcnow()
    if date_to is None:
        date_to = now
    if date_from is None:
        date_from = date_to - timedelta(hours=24)
    if date_to - date_from > timedelta(hours=MAX_TRACK_HOURS):
        date_from = date_to - timedelta(hours=MAX_TRACK_HOURS)

    cache_key_raw = f"{mmsi}:{date_from.isoformat()}:{date_to.isoformat()}"
    cache_key = "vessels:track:" + hashlib.md5(cache_key_raw.encode()).hexdigest()
    cached = await cache_get(cache_key)
    if cached:
        return [VesselTrackPoint(**p) for p in cached]

    rows = (
        await db.execute(
            text("""
                WITH raw AS (
                    SELECT
                        position_time,
                        lat::float          AS lat,
                        lon::float          AS lon,
                        sog_knots::float    AS sog,
                        cog_deg::float      AS cog,
                        heading_deg,
                        nav_status_code,
                        ROW_NUMBER() OVER (ORDER BY position_time)  AS rn,
                        COUNT(*)    OVER ()                          AS total_cnt
                    FROM ais_position
                    WHERE mmsi = :mmsi
                      AND position_time BETWEEN :date_from AND :date_to
                      AND lat IS NOT NULL
                      AND lon IS NOT NULL
                )
                SELECT position_time, lat, lon, sog, cog, heading_deg, nav_status_code
                FROM raw
                WHERE total_cnt <= :max_pts
                   OR rn % GREATEST(1, total_cnt / :max_pts) = 0
                ORDER BY position_time
                LIMIT :max_pts
            """),
            {
                "mmsi": mmsi,
                "date_from": date_from,
                "date_to": date_to,
                "max_pts": MAX_TRACK_POINTS,
            },
        )
    ).all()

    result = [
        VesselTrackPoint(
            time=r[0],
            lat=float(r[1]),
            lon=float(r[2]),
            sog=float(r[3]) if r[3] is not None else None,
            cog=float(r[4]) if r[4] is not None else None,
            heading=int(r[5]) if r[5] is not None else None,
            nav_status_code=int(r[6]) if r[6] is not None else None,
        )
        for r in rows
    ]
    await cache_set(cache_key, [p.model_dump(mode="json") for p in result], ttl=900)
    return result


@router.get("/{mmsi}", response_model=VesselDetail)
async def get_vessel(mmsi: int, db: AsyncSession = Depends(get_db)):
    row = (
        await db.execute(
            select(AisVesselStatic, VesselState, AisShipType.group_name, AisNavStatus.name)
            .outerjoin(VesselState, AisVesselStatic.mmsi == VesselState.mmsi)
            .outerjoin(AisShipType, AisVesselStatic.ship_type_code == AisShipType.code)
            .outerjoin(AisNavStatus, VesselState.last_nav_status == AisNavStatus.code)
            .where(AisVesselStatic.mmsi == mmsi)
        )
    ).first()

    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Vessel not found")

    v, vs, type_group, nav_name = row

    return VesselDetail(
        mmsi=v.mmsi,
        name=v.name,
        call_sign=v.call_sign,
        imo=v.imo,
        ship_type_code=v.ship_type_code,
        ship_type_group=type_group,
        length_m=float(v.length_m) if v.length_m else None,
        width_m=float(v.width_m) if v.width_m else None,
        draught_m=float(v.draught_m) if v.draught_m else None,
        destination=v.destination,
        class_=v.class_,
        dim_to_bow=v.dim_to_bow,
        dim_to_stern=v.dim_to_stern,
        dim_to_port=v.dim_to_port,
        dim_to_starboard=v.dim_to_starboard,
        eta_month=v.eta_month,
        eta_day=v.eta_day,
        eta_hour=v.eta_hour,
        eta_minute=v.eta_minute,
        last_lat=vs.last_lat if vs else None,
        last_lon=vs.last_lon if vs else None,
        last_sog=vs.last_sog if vs else None,
        last_nav_status=nav_name,
        last_heading=vs.last_heading if vs else None,
        last_cog=vs.last_cog if vs else None,
        last_station_id=vs.last_station_id if vs else None,
        last_update=vs.last_received_at if vs else None,
    )
