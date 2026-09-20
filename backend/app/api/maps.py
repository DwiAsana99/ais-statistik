from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.cache import cache_get, cache_set
from app.models.vessel import VesselState, AisVesselStatic
from app.models.position import AisBaseStation, AisAton
from app.models.reference import AisShipType, AisNavStatus, AisAtonType

router = APIRouter(prefix="/api/maps", tags=["maps"])


def make_feature(lon: float, lat: float, properties: dict) -> dict:
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": properties,
    }


@router.get("/vessels")
async def get_vessel_positions(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("maps:vessels")
    if cached:
        return cached

    rows = (
        await db.execute(
            select(
                VesselState.mmsi,
                VesselState.last_lat,
                VesselState.last_lon,
                VesselState.last_sog,
                VesselState.last_cog,
                VesselState.last_heading,
                VesselState.last_nav_status,
                VesselState.last_station_id,
                VesselState.last_timestamp_ais,
                AisVesselStatic.name,
                AisShipType.group_name,
                AisNavStatus.name.label("nav_status_name"),
            )
            .outerjoin(AisVesselStatic, VesselState.mmsi == AisVesselStatic.mmsi)
            .outerjoin(AisShipType, AisVesselStatic.ship_type_code == AisShipType.code)
            .outerjoin(AisNavStatus, VesselState.last_nav_status == AisNavStatus.code)
            .where(VesselState.last_lat.isnot(None), VesselState.last_lon.isnot(None))
        )
    ).all()

    features = [
        make_feature(
            lon=r.last_lon,
            lat=r.last_lat,
            properties={
                "mmsi": r.mmsi,
                "name": r.name,
                "ship_type": r.group_name,
                "nav_status": r.nav_status_name,
                "sog": r.last_sog,
                "cog": r.last_cog,
                "heading": r.last_heading,
                "station_id": r.last_station_id,
                "timestamp": str(r.last_timestamp_ais) if r.last_timestamp_ais else None,
            },
        )
        for r in rows
    ]

    geojson = {"type": "FeatureCollection", "features": features}
    await cache_set("maps:vessels", geojson, ttl=120)
    return geojson


@router.get("/base-stations")
async def get_base_stations(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("maps:base_stations")
    if cached:
        return cached

    rows = (
        await db.execute(
            select(AisBaseStation.mmsi, AisBaseStation.lat, AisBaseStation.lon, AisBaseStation.last_report_at)
            .where(AisBaseStation.lat.isnot(None), AisBaseStation.lon.isnot(None))
        )
    ).all()

    features = [
        make_feature(
            lon=r.lon, lat=r.lat,
            properties={
                "mmsi": r.mmsi,
                "type": "base_station",
                "last_report": str(r.last_report_at) if r.last_report_at else None,
            },
        )
        for r in rows
    ]

    geojson = {"type": "FeatureCollection", "features": features}
    await cache_set("maps:base_stations", geojson, ttl=3600)
    return geojson


@router.get("/aton")
async def get_aton(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("maps:aton")
    if cached:
        return cached

    rows = (
        await db.execute(
            select(
                AisAton.mmsi, AisAton.name, AisAton.lat, AisAton.lon,
                AisAton.virtual_aton, AisAtonType.description.label("aton_type"),
            )
            .outerjoin(AisAtonType, AisAton.aton_type_code == AisAtonType.code)
            .where(AisAton.lat.isnot(None), AisAton.lon.isnot(None))
        )
    ).all()

    features = [
        make_feature(
            lon=r.lon, lat=r.lat,
            properties={
                "mmsi": r.mmsi,
                "name": r.name,
                "type": "aton",
                "aton_type": r.aton_type,
                "virtual": r.virtual_aton,
            },
        )
        for r in rows
    ]

    geojson = {"type": "FeatureCollection", "features": features}
    await cache_set("maps:aton", geojson, ttl=3600)
    return geojson


@router.get("/heatmap")
async def get_heatmap(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("maps:heatmap")
    if cached:
        return cached

    rows = (
        await db.execute(
            select(VesselState.last_lat, VesselState.last_lon, VesselState.last_sog)
            .where(VesselState.last_lat.isnot(None), VesselState.last_lon.isnot(None))
        )
    ).all()

    points = [[r.last_lat, r.last_lon, r.last_sog or 0] for r in rows]
    result = {"points": points, "count": len(points)}
    await cache_set("maps:heatmap", result, ttl=300)
    return result
