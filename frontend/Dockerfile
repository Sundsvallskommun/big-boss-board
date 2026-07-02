# Big Boss Board — frontend (Next.js 15, standalone-output).
# node:22-bookworm-slim (glibc), INTE alpine (musl): musl:s parallella A/AAAA-
# uppslag träffar en conntrack-race i Docker och ger intermittenta ~5 s DNS-stopp
# när servern slår upp `backend` vid SSR (symptom: sidan hänger, noll CPU, funkar
# vid omladdning). glibc har inte problemet — samma val som övriga appar (verktyg).
FROM node:22-bookworm-slim AS base
WORKDIR /app

# --- Beroenden ---
FROM base AS deps
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# --- Build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- Runtime (minimal, standalone) ---
FROM base AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
