#!/usr/bin/env sh
set -e

# Uppstart ändrar schemat genom granskade migrationer, aldrig verksamhetsdata via seed.
# En ny, tom databas initieras uttryckligen med python -m app.seed före första användning.
echo "[entrypoint] kör databasmigrationer..."
alembic upgrade head

echo "[entrypoint] startar Gunicorn (Uvicorn-workers)..."
# PORT konfigurerbar: compose kör 8000; OpenShift/kustomize-basen antar Node-appars
# port 3000 — där sätts PORT=3000 i stället för att patcha service/probes.
exec gunicorn app.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers "${WEB_CONCURRENCY:-2}" \
  --bind "0.0.0.0:${PORT:-8000}" \
  --no-control-socket \
  --timeout "${WEB_TIMEOUT:-60}" \
  --graceful-timeout 30 \
  --keep-alive 75 \
  --access-logfile - \
  --error-logfile -
