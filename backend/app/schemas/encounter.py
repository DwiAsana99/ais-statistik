from pydantic import BaseModel
from datetime import datetime


class EncounterSummary(BaseModel):
    id: str
    mmsi_a: int
    mmsi_b: int
    name_a: str | None = None
    name_b: str | None = None
    ship_type_a: str | None = None
    ship_type_b: str | None = None
    first_seen: datetime
    last_seen: datetime
    duration_minutes: float
    sample_count: int
    min_distance_m: float
    avg_lat: float
    avg_lon: float


class EncounterTrackPoint(BaseModel):
    time: datetime
    lat_a: float
    lon_a: float
    lat_b: float
    lon_b: float
    distance_m: float


class EncounterDetail(EncounterSummary):
    track: list[EncounterTrackPoint]


class EncounterListResponse(BaseModel):
    items: list[EncounterSummary]
    total: int
    date_from: datetime
    date_to: datetime
    distance_m: float
