"""FastAPI-app för Big Boss Board. Alla endpoints under prefix /api."""

from fastapi import FastAPI
from sqlalchemy import text

from app.db import engine
from app.routers import activities, dialogues, import_data, kpi_areas

app = FastAPI(
    title="Big Boss Board API",
    description="Dialogstöd för chefsuppföljning. Endast öppen och publik information.",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.include_router(dialogues.router)
app.include_router(kpi_areas.router)
app.include_router(activities.router)
app.include_router(import_data.router)


@app.get("/api/health", tags=["system"])
async def health() -> dict[str, str]:
    """Healthcheck för compose/Dokploy. Verifierar även databasanslutning."""
    db_status = "ok"
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 — health ska aldrig kasta, bara rapportera
        db_status = "unavailable"

    return {"status": "ok", "service": "bbb-backend", "db": db_status}
