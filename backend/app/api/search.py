from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_db
from app.schemas.statistics import SearchResult

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("", response_model=list[SearchResult])
async def search_vessels(
    q: str = Query(..., min_length=1, max_length=100),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            text("""
                SELECT mmsi, name, call_sign
                FROM ais_vessel_static
                WHERE name ILIKE :q
                   OR call_sign ILIKE :q
                   OR mmsi::text = :exact
                ORDER BY
                    CASE WHEN mmsi::text = :exact THEN 0 ELSE 1 END,
                    name NULLS LAST
                LIMIT 10
            """),
            {"q": f"%{q}%", "exact": q},
        )
    ).all()

    return [
        SearchResult(
            type="vessel",
            mmsi=r[0],
            name=r[1],
            description=r[2] or f"MMSI {r[0]}",
        )
        for r in rows
    ]
