# Big Boss Board — backend (FastAPI). Multi-stage, slim Python.
FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# --- Beroenden (eget lager för cache) ---
FROM base AS deps
# Projektet byggs med setuptools (packages = ["app"]); paketkatalogen måste finnas
# när wheel:en byggs, annars failar `pip install .`.
COPY pyproject.toml ./
COPY app ./app
RUN pip install --upgrade pip && pip install .

# --- Runtime ---
FROM base AS runtime
# Kopiera installerade paket + konsol-skript (gunicorn, alembic) från deps-lagret.
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

COPY . .
RUN chmod +x entrypoint.sh

# Kör som icke-root.
RUN useradd --create-home --uid 10001 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]
