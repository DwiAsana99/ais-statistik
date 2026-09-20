from pydantic import BaseModel
from datetime import datetime


class HealthResponse(BaseModel):
    status: str
    database: bool
    redis: bool
    timestamp: datetime


class PaginationParams(BaseModel):
    page: int = 1
    page_size: int = 20


class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    page_size: int
    total_pages: int


class DateRangeParams(BaseModel):
    date_from: datetime | None = None
    date_to: datetime | None = None
    period: str | None = None  # today, yesterday, 7d, 30d, custom


class ChartDataPoint(BaseModel):
    label: str
    value: float
    color: str | None = None


class TimeSeriesPoint(BaseModel):
    timestamp: str
    value: float
    label: str | None = None
