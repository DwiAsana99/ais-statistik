import asyncio
import logging

from app.database import async_session
from app.cache import cache_delete

logger = logging.getLogger("precompute")

REFRESH_INTERVAL_S = 240  # tick interval; below the shortest cache TTL (300s) so hot keys never go cold
SLOW_TASK_EVERY_N_TICKS = 6  # ~24 min — for slow-changing aggregates (ship type/size/flag distributions)


async def _refresh_dashboard(db):
    from app.api.dashboard import get_overview, get_vessel_type_distribution, get_nav_status_distribution

    await cache_delete("dashboard:overview")
    await get_overview(db=db)
    await cache_delete("dashboard:vessel_type_dist")
    await get_vessel_type_distribution(db=db)
    await cache_delete("dashboard:nav_status_dist")
    await get_nav_status_distribution(db=db)


async def _refresh_traffic(db):
    from app.api.traffic import (
        get_traffic_trend,
        get_hourly_distribution,
        get_traffic_by_station,
        get_heatmap,
        get_daily_by_type,
    )

    for period in ("7d", "30d", "90d"):
        await cache_delete(f"traffic:trend:{period}")
        await get_traffic_trend(period=period, db=db)
    await cache_delete("traffic:hourly")
    await get_hourly_distribution(db=db)
    await cache_delete("traffic:by_station")
    await get_traffic_by_station(db=db)
    await cache_delete("traffic:heatmap")
    await get_heatmap(db=db)
    await cache_delete("traffic:daily_by_type")
    await get_daily_by_type(db=db)


async def _refresh_maps(db):
    from app.api.maps import get_vessel_positions, get_heatmap as get_map_heatmap

    await cache_delete("maps:vessels")
    await get_vessel_positions(db=db)
    await cache_delete("maps:heatmap")
    await get_map_heatmap(db=db)


async def _refresh_statistics(db):
    from app.api.statistics import stats_by_ship_type, stats_by_size, stats_by_flag, vessel_summary_kpis

    await cache_delete("stats:ship_type")
    await stats_by_ship_type(db=db)
    await cache_delete("stats:size")
    await stats_by_size(db=db)
    await cache_delete("stats:flag")
    await stats_by_flag(db=db)
    await cache_delete("stats:kpis")
    await vessel_summary_kpis(db=db)


async def _refresh_traffic_kpis(db):
    # Queries ais_position (26M rows) for median SOG — expensive, runs only in SLOW_TASKS
    from app.api.traffic import get_traffic_kpis, get_sog_distribution

    await cache_delete("traffic:kpis")
    await get_traffic_kpis(db=db)
    await cache_delete("traffic:sog_dist")
    await get_sog_distribution(db=db)


async def _refresh_messages(db):
    from app.api.messages import get_message_summary, get_throughput, get_volume_daily, get_messages_by_type

    await cache_delete("messages:summary")
    await get_message_summary(db=db)
    await cache_delete("messages:throughput")
    await get_throughput(db=db)
    await cache_delete("messages:volume_daily")
    await get_volume_daily(db=db)
    await cache_delete("messages:by_type")
    await get_messages_by_type(db=db)


async def _refresh_stations(db):
    from app.api.stations import get_station_performance, get_station_status, get_station_kpis

    await cache_delete("stations:performance")
    await get_station_performance(db=db)
    await cache_delete("stations:status")
    await get_station_status(db=db)
    await cache_delete("stations:kpis")
    await get_station_kpis(db=db)


async def _refresh_quality(db):
    from app.api.quality import get_quality_summary, get_quality_by_station, get_quality_by_type, get_quality_trend

    await cache_delete("quality:summary")
    await get_quality_summary(db=db)
    await cache_delete("quality:by_station")
    await get_quality_by_station(db=db)
    await cache_delete("quality:trend")
    await get_quality_trend(db=db)
    await cache_delete("quality:by_type")
    await get_quality_by_type(db=db)


async def _refresh_monthly_report(db):
    from app.api.reports import get_monthly_reports

    await cache_delete("reports:monthly:list")
    await get_monthly_reports(db=db)


async def _refresh_behavior(db):
    # Loitering: scans a multi-day window of ais_position (window functions per MMSI) —
    # expensive, so it's a SLOW_TASK. Only the default-parameter query is precomputed;
    # other filter combos the user picks in the UI are computed on demand (cache TTL 1800s).
    import hashlib
    from app.cache import cache_set
    from app.config import get_settings
    from app.services.loitering_service import detect_loitering
    from app.schemas.behavior import LoiteringListResponse

    settings = get_settings()
    avg_sog_lt = settings.loitering_avg_sog_kn_lt
    duration_h_gt = settings.loitering_duration_h_gt
    dist_gt = settings.loitering_avg_dist_port_km_gt

    cache_key_raw = f"None:None:{avg_sog_lt}:{duration_h_gt}:{dist_gt}"
    cache_key = "behavior:loitering:" + hashlib.md5(cache_key_raw.encode()).hexdigest()
    await cache_delete(cache_key)

    items, resolved_from, resolved_to = await detect_loitering(
        db, None, None, avg_sog_lt, duration_h_gt, dist_gt
    )
    result = LoiteringListResponse(
        items=items, total=len(items), date_from=resolved_from, date_to=resolved_to
    )
    await cache_set(cache_key, result.model_dump(mode="json"), ttl=1800)


async def _refresh_anomaly(db):
    # A1+A2+A3 scan full position history per MMSI over the window — expensive, SLOW_TASK.
    # Results are upserted into anomaly_events (persistent), not just cached.
    from app.services.anomaly_service import detect_all, save_events

    events = await detect_all(db, lookback_days=7)
    await save_events(db, events)
    await cache_delete("anomaly:summary")


# Fast tasks hit volatile data (vessel positions, daily traffic) — refresh every tick (~4 min).
FAST_TASKS = [_refresh_dashboard, _refresh_traffic, _refresh_maps, _refresh_messages, _refresh_stations, _refresh_quality]
# Slow tasks hit expensive queries — refresh every SLOW_TASK_EVERY_N_TICKS ticks (~24 min).
SLOW_TASKS = [_refresh_statistics, _refresh_traffic_kpis, _refresh_monthly_report, _refresh_behavior, _refresh_anomaly]


async def _run_tasks(tasks, db):
    for task in tasks:
        try:
            await task(db)
        except Exception:
            logger.exception("precompute task %s failed", task.__name__)


async def precompute_loop():
    tick = 0
    while True:
        async with async_session() as db:
            await _run_tasks(FAST_TASKS, db)
            if tick % SLOW_TASK_EVERY_N_TICKS == 0:
                await _run_tasks(SLOW_TASKS, db)
        tick += 1
        await asyncio.sleep(REFRESH_INTERVAL_S)
