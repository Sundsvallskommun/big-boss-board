# Arkitektur — Big Boss Board (bbb)

Teknisk översikt för utvecklare. För att komma igång, se [`../README.md`](../README.md).
För konventioner (visuellt språk, svenskt UI, dataregel), se [`../CLAUDE.md`](../CLAUDE.md).

## Innehåll

- [Systemöversikt](#systemöversikt)
- [Tjänster & nätverk](#tjänster--nätverk)
- [Request-flöde (en domän)](#request-flöde-en-domän)
- [Datamodell](#datamodell)
- [Nyckeltal: importerade vs dialog-only](#nyckeltal-importerade-vs-dialog-only)
- [Datainflöden](#datainflöden)
- [Migrationer & seed](#migrationer--seed)
- [Visuellt token-lager](#visuellt-token-lager)
- [Viktiga designbeslut & fallgropar](#viktiga-designbeslut--fallgropar)
- [Miljövariabler](#miljövariabler)
- [Tester](#tester)

## Systemöversikt

Tre tjänster i en Docker Compose-stack. Endast **frontend** är publik; den proxar
`/api/*` vidare till backend, så allt ligger på en domän (inga CORS-bekymmer).

```
                 Internet (HTTPS)
                      │
              ┌───────▼────────┐
              │ Traefik (TLS)  │  ← Dokploy sätter domän + Let's Encrypt
              └───────┬────────┘
                      │  :3000
        ┌─────────────▼──────────────┐
        │ frontend (Next.js, SSR)    │
        │  · sidor = server components│
        │  · /api/* → rewrite ────────┼──────┐  internt nät (bbb-internal)
        └─────────────┬──────────────┘      │
       SSR-fetch      │ (BACKEND_INTERNAL_URL)│
                      ▼                        ▼
              ┌────────────────┐        ┌────────────┐
              │ backend        │        │ db         │
              │ (FastAPI/:8000)│───────▶│ Postgres16 │
              └────────────────┘        └────────────┘
              endast /api, OpenAPI       namngiven volym
              på /api/docs               (ej publik)
```

Backend och db har **inga publicerade portar** — de nås bara på det interna
compose-nätverket `bbb-internal`.

## Tjänster & nätverk

Definierade i [`../docker-compose.yml`](../docker-compose.yml):

| Tjänst | Image/Build | Exponerar | Anteckning |
| --- | --- | --- | --- |
| `db` | `postgres:16-alpine` | `5432` (internt) | Namngiven volym `db-data`. |
| `backend` | `./backend` (Python 3.12-slim) | `8000` (internt) | `entrypoint.sh`: migrate → seed → gunicorn (uvicorn-workers). |
| `frontend` | `./frontend` (Node 22 **bookworm-slim**) | `3000` (internt; publik via Traefik) | Next standalone. Healthcheck är node-baserad. |

Lokalt lägger [`../docker-compose.override.yml`](../docker-compose.override.yml) till en
host-port för `frontend` (`FRONTEND_PORT`). Dokploy använder **enbart** `docker-compose.yml`.

## Request-flöde (en domän)

- **Sidladdning:** webbläsaren → Traefik → frontend. Sidorna är Server Components med
  `export const dynamic = "force-dynamic"` och hämtar data **server-side** direkt mot
  backend på det interna nätet (`BACKEND_INTERNAL_URL`, default `http://backend:8000`).
- **Klient-anrop:** webbläsarens `fetch("/api/…")` går till frontend, som via
  `next.config` **rewrites** proxar `/api/*` → backend. Samma domän → inga CORS.
- **Access-gate:** `frontend/middleware.ts` gatar sidor bakom en access-kaka
  (`ACCESS_CODE`/`ADMIN_ACCESSCODE`). `/api/import/*` och `/api/admin/*` **undantas** —
  de är maskin-till-maskin och har egen token-auth (`IMPORT_TOKEN`). `/brand` (loggan)
  är också undantagen (publik).
- **Robusthet:** `frontend/lib/api.ts` (`fetchJson`) har timeout + retry på server-fetchar;
  varje route har `loading.tsx`/`error.tsx`. Se [fallgropar](#viktiga-designbeslut--fallgropar).

## Datamodell

SQLAlchemy-modeller i [`../backend/app/models.py`](../backend/app/models.py). Tabeller:

```
organisation ──1:*── dialogue ──1:*── measurement ──*:1── kpi_area ──*:1── support_function
   (förvaltning)        │                (mätdata,          │  (nyckeltal)     │  ──1:*── tool
person (ansvarig_chef) ─┘                 unik/dialog+area)  ├──1:*── question
                        ├──1:*── activity ───────────────────┤  (dialogfrågor)
                        └──1:*── area_status ────────────────┘
                                 (manuell status, append-only historik/dialog+area)

Fristående:
  submission                 — inkorg/intake (fri text från projektdeltagare)
  status_fraga, statusrapport — innehåll till status-sidan (/status)
```

- **`dialogue`** = en uppföljning för en **förvaltning** (`organisation`) med en
  `ansvarig_chef` (`person`) och en `period`.
- **`measurement`** = utfall för ett nyckeltal i en dialog (unik per `dialogue`+`kpi_area`).
  Har `status` (good/warn/alert), värde/mål, trend och en fri `details`-JSON (t.ex. HME-serie,
  ekonomins månadsserie/resultaträkning, sjukfrånvarons köns-/ålders-nedbrytning).
- **`area_status`** = manuellt satt status + kommentar för nyckeltal **utan** mätdata.
  **Append-only historik** — varje sparning är en ny rad; senaste raden gäller.
- **`kpi_area`** har `questions` (dialogfrågor) och en `support_function` (stödfunktion).

## Nyckeltal: importerade vs dialog-only

Två sorters nyckeltal, som renderas olika i frontend:

| Typ | Nyckeltal | Data | Kort i UI |
| --- | --- | --- | --- |
| **Importerade** | `ekonomi`, `hme`, `sjukfranvaro` | `measurement` (via import) | Värde, mätare, trend, diagram (`DetailPanel`) |
| **Dialog-only** | `verksamhet`, `digital`, `kommunikativt` | inga mätvärden — dialogfrågor + `area_status` | Frågeställningar + manuellt satt status/kommentar med historik (`QuestionPanel`) |

`GET /api/dialogues/{id}` returnerar **alla** områden; `measurement = null` för dialog-only.
Seeden håller `DIALOG_ONLY_KEYS` fria från mätvärden (rensar ev. gamla dummies). Manuell
status sätts i dialogflödet: `POST /api/dialogues/{id}/areas/{area_id}/status` (append).

Bakgrund/roadmap för dialog-only-nyckeltalen finns i [`BYGGPLAN.md`](BYGGPLAN.md) §16–17.

## Datainflöden

Riktig data (HME, ekonomi, sjukfrånvaro) **versionshanteras aldrig** och matas in via
token-skyddade endpoints (`IMPORT_TOKEN`). Alla är **idempotenta upsertar** — säkra att
köra om. Skripten i [`../scripts/`](../scripts/) använder enbart Python-stdlib.

| Nyckeltal | Endpoint(s) | Skript | Källformat |
| --- | --- | --- | --- |
| HME | `POST /api/import/hme` | `import_hme.py` | JSON (officiell rapport); alt. fil-bootstrap via `HME_DATA_DIR` |
| Ekonomi | `POST /api/import/ekonomi` · `/ekonomi-csv` · `/ekonomi-serie` | `import_ekonomi.py`, `import_ekonomi_serie.py` | Qlik-CSV (månadsserie ur flera dagsuttag) |
| Sjukfrånvaro | `POST /api/import/sjukfranvaro-csv` | `import_sjukfranvaro.py` | Qlik personal-CSV (senaste uttag per period) |

```bash
# Exempel (kör mot lokal instans eller prod):
IMPORT_TOKEN=… python3 scripts/import_ekonomi_serie.py --url http://localhost:3000
IMPORT_TOKEN=… python3 scripts/import_sjukfranvaro.py --dir sjukfranvaro-indata --url http://localhost:3000
```

Nyckeln kopplas till rätt förvaltning via masterdata-koden (`organisation.kod` ↔ CSV:ns
`Enhet`). Rapportperiod ≠ uttagsdatum: skripten väljer det **senaste/mest kompletta**
dagsuttaget per period.

**Status-sidan** (`/status`) har egna vägar: en publik inkorg (`POST /api/submissions`,
gatas av access-koden) och token-skyddad triage/publicering (`/api/admin/...`).

## Migrationer & seed

`backend/entrypoint.sh` kör vid **varje** start:

1. `alembic upgrade head` — migrationer i [`../backend/alembic/versions/`](../backend/alembic/versions/) (kedjad revisionshistorik).
2. `python -m app.seed` — **idempotent** seed. Skapar referensdata (stödfunktioner, KPI-områden,
   frågor, exempeldialog) första gången, och **reconcilerar** seed-ägt innehåll vid varje körning
   (t.ex. `kpi_area.info`, dialogfrågor) så ändringar slår igenom i drift. Rensar även dummy-
   mätvärden för dialog-only-nyckeltal.

Ny migration: lägg en fil i [`../backend/alembic/versions/`](../backend/alembic/versions/) —
kopiera formatet från en befintlig och kedja `down_revision` till nuvarande head. Källkoden är
**inte** bind-mountad (den byggs in i imagen via `COPY`), så migrationen byggs in vid
`docker compose build backend` och körs vid start. Enum-typen `status` (good/warn/alert) finns
redan i DB:n — referera den med `create_type=False` i nya tabeller (se `8b3c4d5e6f07_area_status.py`).

## Visuellt token-lager

Frontend hämtar Sundsvalls **visuella grundintryck** men implementerar det i ett **eget,
litet token-lager** — `@sk-web-gui` används inte. Tokens bor i två filer:

- `frontend/tailwind.config.js` — färger, spacing (`token-N` = N px), radie, typografi.
- `frontend/app/globals.css` — CSS-bas + komponentklasser (`.eyebrow`, `.meter`, …).

Markupen använder token-utilities (`bg-background-content`, `text-dark-secondary`,
`vattjom-surface-primary`, status-tokens via `components/status.ts`). **Skriv aldrig ny hex
i sid-markup** — använd en token-utility, lägg värdet i config om det saknas. Lokala
UI-primitiver finns i `frontend/components/ui/`. Fullständiga regler i [`../CLAUDE.md`](../CLAUDE.md).

## Viktiga designbeslut & fallgropar

Sådant som inte syns i koden men är lätt att gå på:

- **Frontend-basimage måste vara glibc** (`node:22-bookworm-slim`), **inte** Alpine/musl.
  musl:s parallella DNS-uppslag träffar en conntrack-race i Docker → intermittenta ~5 s
  DNS-stopp när SSR slår upp `backend` (symptom: sidan hänger, noll CPU, gateway timeout).
  glibc har inte problemet. Konsekvens: slim-imagen saknar `wget`/`curl` → **healthchecken
  är node-baserad** i compose.
- **Diagram (recharts) laddas `ssr: false`** (`next/dynamic` i `DetailPanel`). recharts är
  tungt att server-rendera och ger inget på servern; att SSR:a dem mättade den resurs-
  begränsade frontend-processen under samtidig last.
- **`force-dynamic`-sidor har `loading.tsx` + `error.tsx`**, och server-fetcharna i
  `lib/api.ts` har timeout + retry. Utan det kan en trög/hängande backend frysa en mjuk
  navigering utan återkoppling.
- **Migrationer + seed körs vid varje backend-start.** En trasig migration blockerar starten
  (och därmed Traefik-routingen). Testa lokalt först.
- **En domän + proxy.** Lägg aldrig till CORS/host-portar på interna tjänster; låt frontend
  proxa `/api/*`.

## Miljövariabler

Alla dokumenterade i [`../.env.example`](../.env.example). Riktiga värden ligger i Dokploy,
aldrig i repo.

| Variabel | Tjänst | Beskrivning |
| --- | --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | db | Postgres-uppgifter. |
| `DATABASE_URL` | backend | `postgresql+asyncpg://…@db:5432/…` (måste matcha ovan). |
| `IMPORT_TOKEN` | backend + frontend | Nyckel för `/api/import/*` och `/api/admin/*`. Tom = import avstängd. |
| `HME_DATA_DIR` | backend | Valfri värdkatalog med `HME_totalindex.json` för fil-bootstrap vid start. |
| `BACKEND_INTERNAL_URL` | frontend | Intern backend-URL för SSR/rewrites (default `http://backend:8000`). |
| `ACCESS_CODE` | frontend + backend | Åtkomstkod. Tom = öppen tjänst. |
| `ADMIN_ACCESSCODE` | frontend | Admin-kod som dessutom visar import-GUI:t (`/admin/import`). |
| `NODE_ENV` / `PORT` | frontend | Standard `production` / `3000`. |
| `FRONTEND_PORT` | (lokalt) | Host-port i override-filen. Används inte i Dokploy. |

## Tester

pytest + pytest-asyncio + httpx är konfigurerade som dev-beroenden
(`backend/pyproject.toml`, `asyncio_mode = "auto"`), men någon testsvit är **ännu inte
påbörjad**.

Dev-verktygen (ruff, pytest) ligger **inte** i runtime-imagerna — kör dem lokalt med
dev-beroendena installerade (`cd backend && pip install -e ".[dev]"`, sedan `ruff check app`
/ `pytest`). Frontendens lint + typecheck körs automatiskt av `next build` (dvs
`docker compose build frontend` failar på fel); manuellt via `npm run lint` lokalt.
