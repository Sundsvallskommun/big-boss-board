# Big Boss Board — backend (FastAPI). Multi-stage, slim Python.
FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# --- Beroenden (eget lager för cache) ---
FROM base AS deps
# python3-saml → xmlsec + lxml. De byggs från källa mot samma system-libxml2 —
# blandade wheels ger känd ABI-mismatch (segfault/versionfel i xmlsec).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential pkg-config zlib1g-dev \
        libxml2-dev libxslt1-dev libxmlsec1-dev libxmlsec1-openssl \
    && rm -rf /var/lib/apt/lists/*
# Runtime-deps är låsta i requirements.lock. Projektet installeras därefter utan
# ny beroendelösning; paketkatalogen behövs först i det steget.
COPY pyproject.toml requirements.lock ./
RUN pip install --upgrade pip \
    && pip install --no-binary lxml,xmlsec -r requirements.lock
COPY app ./app
RUN pip install --no-deps .

# --- Runtime ---
FROM base AS runtime
# Delade bibliotek för xmlsec/lxml (SAML-signaturverifiering via python3-saml).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libxml2 libxslt1.1 libxmlsec1-openssl \
    && rm -rf /var/lib/apt/lists/*
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
