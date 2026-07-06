"""FastAPI-app för Big Boss Board. Alla endpoints under prefix /api."""

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException
from sqlalchemy import text

from app.auth.router import router as auth_router
from app.auth.sessions import create_session_store
from app.config import get_settings, validate_runtime_settings
from app.db import engine
from app.routers import (
    activities,
    admin,
    dialogues,
    import_data,
    kpi_areas,
    status_content,
    submissions,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    validate_runtime_settings(settings)
    # Sessionstore (Redis i prod, minne lokalt). Kastar vid start om REDIS_HOST är
    # satt men Redis inte nås — hellre en pod som aldrig blir ready än tysta
    # minnessessioner som tappas vid rollout.
    app.state.session_store = await create_session_store(settings)
    yield
    await app.state.session_store.close()


app = FastAPI(
    title="Big Boss Board API",
    description="Dialogstöd för chefsuppföljning. Endast öppen och publik information.",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.include_router(auth_router)
app.include_router(dialogues.router)
app.include_router(kpi_areas.router)
app.include_router(activities.router)
app.include_router(import_data.router)
app.include_router(submissions.router)
app.include_router(status_content.router)
app.include_router(admin.router)


@app.get("/api/health", tags=["system"])
@app.get("/health", include_in_schema=False)  # oprefixat alias för plattformsprobes
async def health() -> dict[str, str]:
    """Liveness för compose/Dokploy/OpenShift. Svarar alltid 200 — rapporterar
    db-status men fäller inte podden (det gör readiness)."""
    db_status = "ok"
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 — health ska aldrig kasta, bara rapportera
        db_status = "unavailable"

    return {"status": "ok", "service": "bbb-backend", "db": db_status}


@app.get("/api/ready", tags=["system"])
@app.get("/ready", include_in_schema=False)  # oprefixat alias för plattformsprobes
async def ready() -> dict[str, str]:
    """Readiness för OpenShift: 503 när databasen inte nås — podden ska inte få
    trafik förrän den kan svara med data (OPENSHIFT_PROD_PLAN §readiness).
    Oprefixade alias finns eftersom kustomize-basens probes antar Node-apparnas
    rotvägar; via frontend-proxyn exponeras bara /api/*."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail="Databasen nås inte.") from exc
    return {"status": "ready"}
