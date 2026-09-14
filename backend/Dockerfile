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
COPY requirements.lock ./
# Bygg runtime-lxml först, med versionen från samma låsfil. Begränsa sedan
# --no-binary till xmlsec: dess isolerade byggmiljö behöver bara lxml:s headers
# och kan använda en wheel, i stället för att källkompilera en andra lxml-version.
# Båda runtime-biblioteken byggs fortfarande mot systemets libxml2.
RUN pip install --upgrade pip \
    && pip install --no-binary=lxml -c requirements.lock lxml \
    && pip install --no-binary=xmlsec -r requirements.lock \
    && pip check \
    && python -c "from lxml import etree; import xmlsec; from onelogin.saml2.auth import OneLogin_Saml2_Auth"
COPY pyproject.toml ./
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

# Pakethanteraren behövs endast i byggsteget; behåll SAML:s runtime-bibliotek.
RUN python -m pip uninstall -y pip

COPY . .
RUN chmod +x entrypoint.sh

# Kör som icke-root. OpenShift ignorerar USER och kör med godtyckligt UID i grupp 0
# (restricted SCC) — därför grupp 0 + gruppläsrättigheter i stället för egen grupp.
# Appen skriver inget i /app (SAML-nycklar materialiseras i /tmp).
RUN useradd --create-home --uid 10001 --gid 0 appuser \
    && chgrp -R 0 /app \
    && chmod -R g=u /app
USER appuser

EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]
