# CLAUDE.md — projektminne för Big Boss Board (bbb)

Internt arbetsnamn: **Big Boss Board (bbb)**. Visas **aldrig** i gränssnittet.
Publik domän: `bbb.sundsvall.dev`. Produkten är ett **dialogstöd för chefsuppföljning**:
en chef går igenom nyckeltal område för område med en underställd chef och fångar
överenskommelser direkt i samtalet.

Den fullständiga byggplanen finns i [`docs/BYGGPLAN.md`](docs/BYGGPLAN.md).
Designreferens/prototyp: [`docs/uppfoljningsdialog.html`](docs/uppfoljningsdialog.html).

## Visuellt språk (eget lättviktslager)

Frontend hämtar sitt **visuella grundintryck** från Sundsvalls kommuns profil men
implementerar det i ett **eget, litet token-lager** — **inte** hela designsystemet.
`@sk-web-gui` används **inte längre** (beslut: avkoppla beroendet, behåll utseendet).

- **Tokens bor i två filer:** `frontend/tailwind.config.js` (färger, spacing, radie, typografi)
  och `frontend/app/globals.css` (CSS-bas + komponentklasser `.eyebrow`, `.meter`, `.card-selected`).
  Markupen använger token-utilities (`bg-background-content`, `text-dark-secondary`,
  `vattjom-surface-primary` …) precis som förr — bara underlaget bytt.
- **Hex hör hemma i token-filerna**, inte spridda i markup. Centralt: config + globals + de tre
  graf-filerna (`components/charts/*` har seriefärger som hex). Skriv aldrig nya hex i sid-markup —
  använd en token-utility, lägg värdet i config om det saknas.
- **Palett (ur kommunens profil):** vattjom-blå `#0055B8` (`vattjom-surface-primary`), blå text/ikon
  `#00427D` (`vattjom-text-primary`), ljus blå ton `#E6EEF7` (`vattjom-background-100`), ink `#1F1F25`
  (`dark-primary`), dämpad `#51515C` (`dark-secondary`), sidyta `#F0F0F0` (`background-200`), kort
  `#FFFFFF` (`background-content`), hårlinje `#E5E5E5` (`hairline`), avdelare `#B7B7BA` (`divider`),
  fokusring `#0C8CED` (`outline-ring`).
- **Funktionella status/trafikljus:** `status-good #1E8A4E`, `status-warn #EAB308` (medvetet rent
  gult — skilj "Bevaka" från rött), `status-alert #D32F2F`. Semantiska ytor: `success/warning/error`
  med `-text` och `-background-*`. Mappning i `components/status.ts`.
- **Spacing/radie = px-lik skala (`token-N` = N px):** `p-16`=16px, `gap-12`=12px, `rounded-12`=12px,
  `h-48`=48px. Genereras i config (`pxScale`), så vilken px-nivå som helst funkar. Roten är vanlig
  **16px** (inte SK:s 62.5%), så **typografi anges i absoluta px** — text-tokens (`text-small`,
  `text-base`, `text-h1` …) definieras i `tailwind.config.js`, egna storlekar (t.ex. `.eyebrow`)
  i `px` i `globals.css`.
- **UI-primitiver:** lokala i `frontend/components/ui/` (`Button`, `Input`, `Textarea`,
  `FormControl`, `FormLabel`, `Logo`) via barrel `@/components/ui`. Stödjer de props appen använder
  (`Button` variant `primary`/`ghost`, `loading`, `leftIcon`).
- **Logotyp:** `<Logo>` är en **egen wordmark** (emblem + "Sundsvalls kommun" i vattjom-blå), **inte**
  kommunens officiella logotyp (medvetet avsteg, godkänt). Officiella märket finns inte i koden.
- **Typsnitt:** brödtext/fält/knappar = **Arial**, rubriker = **Raleway** (`font-header`), etiketter =
  **Geist Mono** (`font-mono`). Raleway + Geist Mono laddas i `app/layout.tsx` (Google Fonts).

## Språk och ton

- Allt UI-innehåll är på **svenska**.
- Knapptext = **verb i imperativ** ("Spara", "Markera som genomgången", "Visa område").
- Tomma tillstånd och fel skrivs i samma sakliga interface-röst som resten av appen.

## Stack

- **Frontend:** Next.js 15 (App Router) + React 19 + TypeScript, Tailwind + eget token-lager
  (se "Visuellt språk"). Standalone-output.
  Proxar `/api/*` → backend via `next.config` rewrites (en domän, inga CORS-bekymmer).
- **Backend:** FastAPI + SQLAlchemy 2.0 + Pydantic v2 + Alembic. Uvicorn (Gunicorn i prod).
  Alla endpoints under prefix `/api`. OpenAPI på `/api/docs`.
- **Databas:** PostgreSQL 16. Namngiven volym, ej publik. Migrationer + idempotent seed vid deploy.
- **Infra:** Docker Compose via Dokploy + Traefik (TLS). Endast `frontend` exponeras publikt.

## Dataregel (viktig)

- Appen används **endast för öppen och publik information**. Inga personuppgifter eller
  känsliga uppgifter — gäller även dummydata. Visas som Alert i UI.
- Dummydata för KPI:er utan källa är **fiktiv**. HME använder **riktiga anonymiserade
  aggregat** per förvaltning ur den officiella rapporten (flerårig serie → historik + trend).
- **HME-data (rapport/rådata) versionshanteras aldrig** (`indata/` och `backend/app/data/*.json`
  är gitignorerade). Två vägar in: (1) **import-endpoint** `POST /api/import/hme` (token-skyddad,
  `IMPORT_TOKEN`) via `scripts/import_hme.py` — upsertar, rekommenderas i drift och vid nya år;
  (2) **fil vid uppstart** — `backend/app/data/hme_matning.json` (monteras via `HME_DATA_DIR`)
  läses av seed. Saknas båda kör appen vidare med enbart referensdata. Upsert-logiken delas av
  endpoint och seed i `app/services/hme_import.py`. (`scripts/build_hme_aggregate.py` finns kvar
  som rådata-analys: delindex + chef/medarbetare med n<5-suppression — ej primär källa.)

## Inkorg / intake (status-sidan)

Projektdeltagare kan lämna in **fri text** (fråga/synpunkt/aktivitet) via formuläret
`/status/skicka-in` (CTA-länk från `/status`). Sidan gatas av access-koden (vanlig
middleware). Inlämningar hamnar i en **egen kö** (`submission`-tabellen) och rör
**aldrig** de kurerade kolumnerna på status-sidan — arbetsgruppen läser, knådar och
publicerar manuellt.

- **Publik create:** `POST /api/submissions` (ingen token; gatad av middleware via proxyn).
  Server action `app/status/skicka-in/actions.ts` → backend. Honeypot-fält mot bottar,
  maxlängd 4000 tecken. Endast öppen/publik info (dataregeln gäller — inga personuppgifter).
- **Triage (token-skyddad, samma `IMPORT_TOKEN`):** `GET /api/admin/submissions[?status=ny]`
  och `PATCH /api/admin/submissions/{id}` (status: `ny`/`granskad`/`publicerad`/`arkiverad`
  + intern `notering`). CLI: `IMPORT_TOKEN=… python3 scripts/read_inbox.py --url <bas-url>`.
- Logik i `app/services/submissions.py`; modell i `models.py`; migration
  `6f4a1b2c8d05_submission_inkorg.py`.
- **Ej gjort ännu:** status-sidans publika kolumner ligger fortfarande hårdkodade i
  `frontend/app/status/data.ts`. Planerad Fas B: flytta status-innehållet till DB med
  publiceringsväg, så triage → publicering blir helt datadrivet.

## Ekonomi: månadsserie (hela året)

Nettokostnadsdiagrammet (`components/charts/EkonomiNettokostnadChart`) ritar en **månadsserie**.
Serien ligger i mätvärdets `details.serie` (per förvaltning) och byggs ur flera Qlik-CSV-uttag:

- **Rapportperiod ≠ uttagsdatum.** CSV:ns `Period`-kolumn är månadsstängningen (t.ex. `2026-05-31`);
  filnamnets datum (`kpidata_RR_2026-06-26`) är dagsuttaget. Flera dagsuttag per period — det
  **sista** är mest komplett.
- **Import:** `scripts/import_ekonomi_serie.py --dir ekonomi-indata --url <bas-url>` grupperar på
  period, väljer senaste uttag per period och POSTar hela serien till `POST /api/import/ekonomi-serie`
  (token-skyddad). Backend (`services/ekonomi_import.csvs_to_serie_payload`) sätter senaste perioden
  som kortets huvudvärde och fyller `details.serie`. Enkelperiod-vägarna (`/ekonomi`, `/ekonomi-csv`,
  seed) finns kvar; utan serie faller grafen tillbaka på senaste perioden.
- **`ekonomi-indata/` versionshanteras aldrig** (gitignorerad, som HME/ekonomi-rådata).

## Faser (bygg en i taget, commit + verifiering per fas)

- **Fas 0 — Skelett:** monorepo, denna fil, `docker-compose.yml`, hello-world som pratar ihop.
- **Fas 1 — Backend & data:** modeller, migration, seed, läs-API.
- **Fas 2 — Frontend:** dashboard i eget token-lager (Sundsvalls visuella språk), paritet med prototypen.
- **Fas 3 — Skrivflöden:** spara överenskommelser, markera genomgången, progress persisteras.
- **Fas 4 — Login & polish:** access-kod-stub, tillgänglighet (WCAG 2.2 AA), felhantering.
- **Fas 5 — Deploy:** härda Dockerfiles, Compose för Dokploy, env/secrets, domän + TLS.

## Tillgänglighet (WCAG 2.2 AA)

Synligt fokus (≥2 px), tangentbordsnavigering, `<label>` på fält, `aria-label` på
ikon-knappar, `prefers-reduced-motion`, kontrast ≥4.5:1. Verifiera med axe/Lighthouse.

## Konventioner

- Hemligheter aldrig i repo — bara i Dokploy. Se `.env.example` för nycklar.
- Interna tjänster (backend, db) får inga publika portar.
