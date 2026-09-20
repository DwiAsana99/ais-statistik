from fastapi import APIRouter
from app.api import dashboard, vessels, statistics, traffic, maps, encounters, reports, search, messages, stations, quality, behavior, anomaly

api_router = APIRouter()
api_router.include_router(dashboard.router)
api_router.include_router(vessels.router)
api_router.include_router(statistics.router)
api_router.include_router(traffic.router)
api_router.include_router(maps.router)
api_router.include_router(encounters.router)
api_router.include_router(reports.router)
api_router.include_router(search.router)
api_router.include_router(messages.router)
api_router.include_router(stations.router)
api_router.include_router(quality.router)
api_router.include_router(behavior.router)
api_router.include_router(anomaly.router)
