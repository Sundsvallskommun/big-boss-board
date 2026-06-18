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
- **Typsnitt:** brödtext/fält/knappar = **Arial** (SK:s `--sk-fontFamily-sans`), rubriker =
  **Raleway**, etiketter = **Geist Mono**. Prototypens **Inter** är en approximation och
  används medvetet INTE — SK:s sans-token gäller (beslut bekräftat).

### Fallgropar i SK-preseten (verifierat i denna kodbas)

- **Root-fontstorlek = 62.5% (10px).** SK-temat sätter `html { font-size: 62.5% }`, så
  `1rem = 10px` (inte 16px). Allt rem-baserat blir därför ~0.6× mot en 16px-root.
  **Skriv egna font-storlekar (t.ex. `.eyebrow`) i absoluta `px`**, annars blir de för små.
  SK:s text-tokens (`text-h1`, `text-small` …) och spacing-tokens är kalibrerade för 10px-root.
- **Spacing-skala:** preseten mappar Tailwinds spacing till `N/10 rem` (`p-4` = 0.4rem),
  vilket trycker ihop all layout. Vi **återställer default-Tailwinds skala** för utilities
  i `tailwind.config.js` (`theme.extend.spacing = require("tailwindcss/defaultTheme").spacing`).
  Skriv därför spacing/storlek med **default-Tailwind-nummer** (`p-4`=1rem, `gap-3`=0.75rem,
  `h-12`=3rem). SK-komponenterna använder `var(--sk-spacing-*)` i egen CSS och påverkas inte.
- **`primary` är svart ink, inte blått.** Brand-blått = `vattjom`-token: `vattjom-surface-primary`
  (ytor/ramar), `vattjom-text-primary` (text/ikoner). Blå fokusring = `outline-ring`.
- **`bg-background` är trasig** (preseten pekar på en felstavad variabel → transparent). Använd
  `bg-background-200` för grå sidyta, `bg-background-content` för vita kort.
- **Ljus hairline-ram:** `border-divider` är mörk/tung; för prototypens tunna linjer används
  färgen `hairline` (= `--sk-colors-primitives-gray-200`), definierad i `tailwind.config.js`.
- **Opacity-modifier funkar inte på var-färger** (`bg-white/80`, `bg-background-content/95`
  genereras inte → transparent). Använd solid färg eller sätt värdet direkt i CSS.

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
