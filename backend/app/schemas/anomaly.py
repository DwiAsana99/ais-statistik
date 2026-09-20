from pydantic import BaseModel
from datetime import datetime


class AnomalyA0Summary(BaseModel):
    total_mmsi_registered: int
    mmsi_invalid_count: int
    mmsi_placeholder_count: int
    n_vessels_active: int
    lookback_days: int
    n_points_total: int
    n_sog_na: int
    n_cog_na: int
    n_latlon_bad: int


class AnomalyEvent(BaseModel):
    id: int
    mmsi: int
    vessel_name: str | None = None
    ship_type: str | None = None
    type: str
    detector: str
    t_start: datetime
    t_end: datetime | None = None
    lat: float | None = None
    lon: float | None = None
    score: float | None = None
    severity: str
    status: str
    evidence: dict


class AnomalyEventsResponse(BaseModel):
    items: list[AnomalyEvent]
    total: int


class AnomalyTypeCount(BaseModel):
    type: str
    count: int


class AnomalySummary(BaseModel):
    total_events: int
    by_type: list[AnomalyTypeCount]
    last_run_at: datetime | None = None
