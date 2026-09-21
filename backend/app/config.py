from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Connection strings wajib dipasok lewat environment/.env. Jangan simpan
    # kredensial database sebagai default di source code.
    database_url: str
    database_url_sync: str

    redis_host: str
    redis_port: int = 6379
    redis_password: str

    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    app_title: str = "UVMS Modul Statistik AIS"
    app_version: str = "0.1.0"

    # Integrasi login UVMS (README-INTEGRASI-AIS-STATISTIK.md) — [PARAM] UVMS
    # belum jalan saat ini ditulis; uvms_internal_url WAJIB diisi via .env
    # sebelum guard ini bisa dites end-to-end. Fail-closed (503) selama itu.
    # Nama env var disamakan dengan projek UVMS lain (ais-cri, ais-kpler, dst).
    uvms_internal_url: str = ""
    uvms_module_code: str = "statistik"
    uvms_session_cookie_name: str = "uvms_session"
    uvms_authorize_timeout_sec: float = 5.0
    # Guard nonaktif (bypass) selama false — default dev lokal selagi UVMS
    # belum jalan. Lihat app/auth.py. HARUS true di production; tiap request
    # yang lewat bypass ini dicatat sbg WARNING di log, sengaja berisik supaya
    # tidak diam-diam kebawa ke deploy.
    uvms_auth_enabled: bool = False

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
