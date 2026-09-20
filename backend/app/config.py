from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://uvms:P455word%40AIS@157.66.34.54:5432/dbais"
    database_url_sync: str = "postgresql+psycopg2://uvms:P455word%40AIS@157.66.34.54:5432/dbais"

    redis_host: str = "157.66.34.54"
    redis_port: int = 6379
    redis_password: str = "Sbm2025"

    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    app_title: str = "UVMS Modul Statistik AIS"
    app_version: str = "0.1.0"

    # Loitering detection (Fase 12) — algoritma P1, lihat loitering.md.
    # Ambang batas di sini, BUKAN di-hardcode di service, biar konsisten dg prinsip "jangan hardcode".
    loitering_ports_file: str = "../data/ports.csv"
    loitering_gap_hours: float = 4.0            # pemisah trajektori
    loitering_min_points: int = 10              # cleaning: min titik per trajektori
    loitering_sog_std_max: float = 2.0          # cleaning: ambang "stationary-like"
    loitering_cog_std_eps: float = 1.0e-9
    loitering_drop_logic: str = "and"           # "and" | "or" — lihat loitering.md Bagian 9 #2
    loitering_sog_range: tuple[float, float] = (0.0, 70.0)
    loitering_avg_sog_kn_lt: float = 2.0
    loitering_duration_h_gt: float = 2.0
    loitering_avg_dist_port_km_gt: float = 37.04  # 20 nm
    loitering_lookback_days_default: int = 7
    loitering_lookback_days_max: int = 30

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
