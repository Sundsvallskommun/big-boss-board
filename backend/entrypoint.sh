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
exec gunicorn app.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers "${WEB_CONCURRENCY:-2}" \
  --bind 0.0.0.0:8000 \
  --access-logfile - \
  --error-logfile -
