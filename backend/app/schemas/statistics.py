from pydantic import BaseModel
from app.schemas.common import ChartDataPoint, TimeSeriesPoint


class DashboardOverview(BaseModel):
    total_vessels: int
    active_vessels: int
    vessels_underway: int
    vessels_anchored: int
    vessels_moored: int
    total_ship_types: int
    messages_today: int = 0
    stations_online: int = 0
    error_rate: float = 0.0


class TrafficKpis(BaseModel):
    total_active_vessels_7d: int
    sog_median_knots: float
    peak_hour: int


class VesselKpis(BaseModel):
    unique_ship_types: int
    largest_vessel_loa: float | None
    dominant_flag: str | None


class SogBin(BaseModel):
    bin_start: float
    count: int


class SearchResult(BaseModel):
    type: str
    mmsi: int
    name: str | None
    description: str | None


class DistributionResponse(BaseModel):
    title: str
    data: list[ChartDataPoint]
    total: int


class TrendResponse(BaseModel):
    title: str
    data: list[TimeSeriesPoint]
    period: str


class StationStats(BaseModel):
    station_id: str
    station_name: str | None = None
    vessel_count: int
    message_count: int | None = None


class HeatmapPoint(BaseModel):
    day: int   # 0=Sunday … 6=Saturday (PostgreSQL DOW)
    hour: int  # 0-23
    value: int


class MessageSummary(BaseModel):
    total_messages: int
    avg_per_vessel: float
    unique_msg_types: int
    class_a_pct: float
    class_b_pct: float
    throughput_per_hour: float


class MessageTypeBreakdown(BaseModel):
    msg_type: int
    type_name: str | None
    count: int
    pct: float


class StationPerformance(BaseModel):
    station_id: str
    station_name: str | None
    mmsi: int | None
    lat: float | None
    lon: float | None
    vessel_count: int
    msg_per_hour: float
    last_seen: str | None
    status: str  # "online" | "degraded" | "offline" | "unknown"


class StationKpis(BaseModel):
    total_stations: int
    online_count: int
    degraded_count: int
    offline_count: int
    total_vessel_coverage: int
    total_throughput_per_hour: float


class QualitySummary(BaseModel):
    error_rate_pct: float
    total_errors: int
    total_messages: int
    parse_error_count: int
    duplicate_count: int
    invalid_mmsi_count: int
    status: str  # "healthy" | "warning" | "critical"


class QualityByStation(BaseModel):
    station_id: str
    error_count: int
    total_count: int
    error_rate_pct: float
    severity: str  # "ok" | "warning" | "critical"


class WeeklyBreakdown(BaseModel):
    week_num: int
    messages: int
    vessels: int


class MonthlyReport(BaseModel):
    year: int
    month: int
    month_label: str
    total_messages: int
    total_vessels: int
    active_days: int
    avg_error_rate: float
    msg_change_pct: float | None = None


class MonthlyReportDetail(MonthlyReport):
    total_errors: int
    weekly_breakdown: list[WeeklyBreakdown]
    top_ship_types: list[ChartDataPoint]
    top_stations: list[ChartDataPoint]
