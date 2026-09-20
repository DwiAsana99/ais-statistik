from pydantic import BaseModel
from datetime import datetime


class VesselListItem(BaseModel):
    mmsi: int
    name: str | None = None
    call_sign: str | None = None
    imo: int | None = None
    ship_type_code: int | None = None
    ship_type_group: str | None = None
    length_m: float | None = None
    width_m: float | None = None
    draught_m: float | None = None
    destination: str | None = None
    last_lat: float | None = None
    last_lon: float | None = None
    last_sog: float | None = None
    last_nav_status: str | None = None
    last_update: datetime | None = None

    class Config:
        from_attributes = True


class VesselDetail(VesselListItem):
    class_: str | None = None
    dim_to_bow: int | None = None
    dim_to_stern: int | None = None
    dim_to_port: int | None = None
    dim_to_starboard: int | None = None
    eta_month: int | None = None
    eta_day: int | None = None
    eta_hour: int | None = None
    eta_minute: int | None = None
    last_heading: int | None = None
    last_cog: float | None = None
    last_station_id: str | None = None


class VesselPosition(BaseModel):
    mmsi: int
    lat: float
    lon: float
    sog: float | None = None
    cog: float | None = None
    heading: int | None = None
    nav_status: int | None = None
    timestamp: datetime


class VesselTrackPoint(BaseModel):
    time: datetime
    lat: float
    lon: float
    sog: float | None = None
    cog: float | None = None
    heading: int | None = None
    nav_status_code: int | None = None
