# Big Boss Board — frontend (Next.js 15, standalone-output).
# node:22-bookworm-slim (glibc), INTE alpine (musl): musl:s parallella A/AAAA-
# uppslag träffar en conntrack-race i Docker och ger intermittenta ~5 s DNS-stopp
# när servern slår upp `backend` vid SSR (symptom: sidan hänger, noll CPU, funkar
# vid omladdning). glibc har inte problemet — samma val som övriga appar (verktyg).
FROM node:22-bookworm-slim AS base
WORKDIR /app

# --- Beroenden ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- Build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# CI-mönstret (delade pipelinen bygger EN image för alla miljöer): bygg med
# platshållare ur .env-cicd; entrypoint.sh ersätter dem vid containerstart.
RUN cp .env-cicd .env.local
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- Runtime (minimal, standalone) ---
FROM base AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# uid 1001 i GRUPP 0: OpenShift (restricted SCC) ignorerar USER och kör godtyckligt
# UID i grupp 0 — därför ägs filerna av 1001:0 och .next är gruppskrivbar så
# entrypointens sed-ersättning fungerar för vilket UID som helst.
RUN useradd --system --uid 1001 --gid 0 nextjs

COPY --from=build --chown=1001:0 /app/public ./public
COPY --from=build --chown=1001:0 /app/.next/standalone ./
COPY --from=build --chown=1001:0 /app/.next/static ./.next/static
RUN chmod -R g+w /app/.next

COPY --chown=1001:0 entrypoint.sh ./
RUN chmod 0555 entrypoint.sh && sed -i 's/\r$//' ./entrypoint.sh

USER 1001
EXPOSE 3000
ENTRYPOINT ["/app/entrypoint.sh"]
