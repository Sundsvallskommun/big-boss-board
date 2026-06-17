# CLAUDE.md — projektminne för Big Boss Board (bbb)

Internt arbetsnamn: **Big Boss Board (bbb)**. Visas **aldrig** i gränssnittet.
Publik domän: `bbb.sundsvall.dev`. Produkten är ett **dialogstöd för chefsuppföljning**:
en chef går igenom nyckeltal område för område med en underställd chef och fångar
överenskommelser direkt i samtalet.

Den fullständiga byggplanen finns i [`docs/BYGGPLAN.md`](docs/BYGGPLAN.md).
Designreferens/prototyp: [`docs/uppfoljningsdialog.html`](docs/uppfoljningsdialog.html).

## Designsystem (obligatoriskt)

- Frontend ska använda Sundsvalls designsystem: `@sk-web-gui/react` + `@sk-web-gui/core`.
- Komponenter och tokens hämtas **endast** därifrån. Referens: <https://ui.sundsvall.dev/llms-full.txt>.
- **Hårdkoda aldrig hex-färger.** Använd designsystemets CSS-variabler / Tailwind-preset.
- Bespoke (finns ej i SK): mätaren/gauge (SVG), KPI-kortens layout, dialogpanelen —
  byggs med SK:s tokens, inte egna hex.
- Officiell logotyp (`<Logo />`) får aldrig modifieras, lutas eller dekoreras.

## Språk och ton

- Allt UI-innehåll är på **svenska**.
- Knapptext = **verb i imperativ** ("Spara", "Markera som genomgången", "Visa område").
- Tomma tillstånd och fel skrivs i samma sakliga interface-röst som resten av appen.

## Stack

- **Frontend:** Next.js 15 (App Router) + React 19 + TypeScript, `@sk-web-gui`. Standalone-output.
  Proxar `/api/*` → backend via `next.config` rewrites (en domän, inga CORS-bekymmer).
- **Backend:** FastAPI + SQLAlchemy 2.0 + Pydantic v2 + Alembic. Uvicorn (Gunicorn i prod).
  Alla endpoints under prefix `/api`. OpenAPI på `/api/docs`.
- **Databas:** PostgreSQL 16. Namngiven volym, ej publik. Migrationer + idempotent seed vid deploy.
- **Infra:** Docker Compose via Dokploy + Traefik (TLS). Endast `frontend` exponeras publikt.

## Dataregel (viktig)

- Appen används **endast för öppen och publik information**. Inga personuppgifter eller
  känsliga uppgifter — gäller även dummydata. Visas som Alert i UI.
- All seed/dummydata är **fiktiv**.

## Faser (bygg en i taget, commit + verifiering per fas)

- **Fas 0 — Skelett:** monorepo, denna fil, `docker-compose.yml`, hello-world som pratar ihop.
- **Fas 1 — Backend & data:** modeller, migration, seed, läs-API.
- **Fas 2 — Frontend mot designsystemet:** dashboard med `@sk-web-gui`, paritet med prototypen.
- **Fas 3 — Skrivflöden:** spara överenskommelser, markera genomgången, progress persisteras.
- **Fas 4 — Login & polish:** access-kod-stub, tillgänglighet (WCAG 2.2 AA), felhantering.
- **Fas 5 — Deploy:** härda Dockerfiles, Compose för Dokploy, env/secrets, domän + TLS.

## Tillgänglighet (WCAG 2.2 AA)

Synligt fokus (≥2 px), tangentbordsnavigering, `<label>` på fält, `aria-label` på
ikon-knappar, `prefers-reduced-motion`, kontrast ≥4.5:1. Verifiera med axe/Lighthouse.

## Konventioner

- Hemligheter aldrig i repo — bara i Dokploy. Se `.env.example` för nycklar.
- Interna tjänster (backend, db) får inga publika portar.
