from fastapi import APIRouter, Depends
from app.api import dashboard, vessels, statistics, traffic, maps, encounters, reports, search, messages, stations, quality, behavior, anomaly
from app.auth import require_statistik

# Semua data API di balik guard UVMS — README-INTEGRASI-AIS-STATISTIK.md.
# /api/health SENGAJA tidak lewat sini (didefinisikan langsung di main.py,
# publik, dipakai health check container/orchestrator).
api_router = APIRouter(dependencies=[Depends(require_statistik)])
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
