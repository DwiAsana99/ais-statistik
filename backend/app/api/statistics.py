from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, cast, Integer

from app.database import get_db
from app.cache import cache_get, cache_set
from app.models.vessel import AisVesselStatic
from app.models.reference import AisShipType
from app.schemas.statistics import DistributionResponse, VesselKpis
from app.schemas.common import ChartDataPoint

router = APIRouter(prefix="/api/statistics", tags=["statistics"])

MID_COUNTRY = {
    525: "Indonesia",
    440: "South Korea",
    636: "Liberia",
    477: "Hong Kong",
    563: "Singapore",
    538: "Marshall Islands",
    371: "Panama",
    412: "China",
    431: "Japan",
    205: "Belgium",
}


@router.get("/by-ship-type", response_model=DistributionResponse)
async def stats_by_ship_type(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("stats:ship_type")
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
    data = [ChartDataPoint(label=r[0] or "Unknown", value=r[1]) for r in rows]

    result = DistributionResponse(title="Statistik Kapal per Tipe", data=data, total=total)
    await cache_set("stats:ship_type", result.model_dump(), ttl=3600)
    return result


@router.get("/by-size", response_model=DistributionResponse)
async def stats_by_size(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("stats:size")
    if cached:
        return DistributionResponse(**cached)

    size_label = case(
        (AisVesselStatic.length_m < 30, "< 30m"),
        (AisVesselStatic.length_m < 50, "30-50m"),
        (AisVesselStatic.length_m < 100, "50-100m"),
        (AisVesselStatic.length_m < 150, "100-150m"),
        (AisVesselStatic.length_m < 200, "150-200m"),
        (AisVesselStatic.length_m >= 200, ">= 200m"),
        else_="Unknown",
    )

    rows = (
        await db.execute(
            select(size_label.label("size_group"), func.count())
            .where(AisVesselStatic.length_m.isnot(None))
            .group_by(size_label)
            .order_by(size_label)
        )
    ).all()

    total = sum(r[1] for r in rows)
    data = [ChartDataPoint(label=r[0], value=r[1]) for r in rows]

    result = DistributionResponse(title="Distribusi Ukuran Kapal (LOA)", data=data, total=total)
    await cache_set("stats:size", result.model_dump(), ttl=3600)
    return result


@router.get("/by-flag", response_model=DistributionResponse)
async def stats_by_flag(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("stats:flag")
    if cached:
        return DistributionResponse(**cached)

    mid_expr = cast(AisVesselStatic.mmsi / 1000000, Integer)

    rows = (
        await db.execute(
            select(mid_expr.label("mid"), func.count())
            .group_by(mid_expr)
            .order_by(func.count().desc())
            .limit(15)
        )
    ).all()

    total = sum(r[1] for r in rows)
    data = [
        ChartDataPoint(
            label=MID_COUNTRY.get(r[0], f"MID {r[0]}"),
            value=r[1],
        )
        for r in rows
    ]

    result = DistributionResponse(title="Distribusi Bendera Kapal", data=data, total=total)
    await cache_set("stats:flag", result.model_dump(), ttl=3600)
    return result


@router.get("/summary-kpis", response_model=VesselKpis)
async def vessel_summary_kpis(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("stats:kpis")
    if cached:
        return VesselKpis(**cached)

    unique_types = await db.scalar(
        select(func.count(func.distinct(AisShipType.group_name)))
        .join(AisVesselStatic, AisVesselStatic.ship_type_code == AisShipType.code)
    )

    largest_loa = await db.scalar(select(func.max(AisVesselStatic.length_m)))

    mid_expr = cast(AisVesselStatic.mmsi / 1000000, Integer)
    top_mid_row = (
        await db.execute(
            select(mid_expr.label("mid"), func.count().label("cnt"))
            .group_by(mid_expr)
            .order_by(func.count().desc())
            .limit(1)
        )
    ).first()

    dominant_flag = MID_COUNTRY.get(top_mid_row[0], f"MID {top_mid_row[0]}") if top_mid_row else None

    result = VesselKpis(
        unique_ship_types=int(unique_types or 0),
        largest_vessel_loa=float(largest_loa) if largest_loa is not None else None,
        dominant_flag=dominant_flag,
    )
    await cache_set("stats:kpis", result.model_dump(), ttl=3600)
    return result
