from pydantic import BaseModel
from datetime import datetime


class LoiteringEvent(BaseModel):
    id: str
    mmsi: int
    vessel_name: str | None = None
    ship_type: str | None = None
    start_time: datetime
    end_time: datetime
    duration_minutes: float
    centroid_lat: float
    centroid_lon: float
    avg_sog: float
    point_count: int
    avg_dist_port_km: float


class LoiteringTrackPoint(BaseModel):
    time: datetime
    lat: float
    lon: float
    sog: float


class LoiteringDetail(LoiteringEvent):
    track: list[LoiteringTrackPoint]


class LoiteringListResponse(BaseModel):
    items: list[LoiteringEvent]
    total: int
    date_from: datetime
    date_to: datetime
