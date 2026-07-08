#!/usr/bin/env sh
set -e

# Migrationer + seed kopplas på i Fas 1 (alembic upgrade head && python -m app.seed).
# Förbered redan nu: kör om konfigurationen finns, hoppa annars tyst över.
if [ -f "alembic.ini" ]; then
  echo "[entrypoint] kör databasmigrationer..."
  alembic upgrade head
fi

if python -c "import importlib.util,sys; sys.exit(0 if importlib.util.find_spec('app.seed') else 1)" 2>/dev/null; then
  echo "[entrypoint] kör seed (idempotent)..."
  python -m app.seed
fi

echo "[entrypoint] startar Gunicorn (Uvicorn-workers)..."
# PORT konfigurerbar: compose kör 8000; OpenShift/kustomize-basen antar Node-appars
# port 3000 — där sätts PORT=3000 i stället för att patcha service/probes.
exec gunicorn app.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers "${WEB_CONCURRENCY:-2}" \
  --bind "0.0.0.0:${PORT:-8000}" \
  --no-control-socket \
  --access-logfile - \
  --error-logfile -
