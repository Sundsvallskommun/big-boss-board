# Big Boss Board (bbb)

Dialogstöd för chefsuppföljning. En chef går igenom nyckeltal område för område
tillsammans med en underställd chef och fångar aktiviteter och en samlad statusbild
direkt i samtalet.

> Internt arbetsnamn (visas **aldrig** i UI). Publik domän: `bbb.sundsvall.dev`.
> Tjänsten används **endast för öppen och publik information** — inga personuppgifter
> eller känsliga uppgifter, gäller även dummydata. All fiktiv data är markerad som sådan.

Prototyp/designreferens: [`docs/uppfoljningsdialog.html`](docs/uppfoljningsdialog.html).

## Innehåll

- [Stack](#stack)
- [Kom igång lokalt](#kom-igång-lokalt)
- [Vanliga utvecklingsuppgifter](#vanliga-utvecklingsuppgifter)
- [Projektstruktur](#projektstruktur)
- [Vidare läsning](#vidare-läsning)

## Stack

| Lager | Teknik |
| --- | --- |
| **Frontend** | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind + ett eget litet token-lager (Sundsvalls visuella språk). Standalone-output. |
| **Backend** | FastAPI · SQLAlchemy 2.0 (async) · Pydantic v2 · Alembic. Uvicorn-workers via Gunicorn. Alla endpoints under `/api`, OpenAPI på `/api/docs`. |
| **Databas** | PostgreSQL 16 (namngiven volym, ej publik). |
| **Infra** | Docker Compose via Dokploy + Traefik (TLS). Endast `frontend` exponeras publikt; den proxar `/api/*` → backend (en domän, inga CORS-bekymmer). |

> Obs: `@sk-web-gui` (Sundsvalls designsystem-paket) används **inte** — utseendet är
> återskapat i ett eget token-lager. Se [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#visuellt-token-lager).

## Kom igång lokalt

**Förkrav:** Docker Engine + Docker Compose v2. (Node 22 / Python 3.12 behövs bara om du
vill köra en tjänst utanför Docker eller köra importskripten.)

```bash
git clone git@github.com:jarikoponen/bbb.git
cd bbb
cp .env.example .env          # sätt POSTGRES_PASSWORD (och matcha den i DATABASE_URL)
docker compose up --build
```

`docker compose up` laddar automatiskt `docker-compose.override.yml`, som publicerar
frontend-porten lokalt. Backend kör vid uppstart **migrationer + idempotent seed** innan
Gunicorn startar (se `backend/entrypoint.sh`), så databasen fylls med referens- och
dummydata automatiskt.

Verifiera:

- Appen: <http://localhost:3000>
- Backend-health via proxyn: <http://localhost:3000/api/health> → `{"status":"ok",…,"db":"ok"}`
- API-dokumentation (OpenAPI/Swagger): <http://localhost:3000/api/docs>

Är port 3000 upptagen — sätt `FRONTEND_PORT` i `.env` (t.ex. `FRONTEND_PORT=3399`).

Vill du simulera **exakt** produktionskonfigurationen (inga publicerade portar, som
Dokploy kör) utan override-filen:

```bash
docker compose -f docker-compose.yml up --build
```

### Åtkomstkod (valfritt lokalt)

Med tomma `ACCESS_CODE`/`ADMIN_ACCESSCODE` är tjänsten öppen. Sätt dem i `.env` för att
kräva inloggning; `ADMIN_ACCESSCODE` ger dessutom import-GUI:t på `/admin/import`.

## Vanliga utvecklingsuppgifter

Snabb iterationsloop (bygg om + starta bara den ändrade tjänsten):

```bash
docker compose build frontend && docker compose up -d frontend   # efter frontend-ändring
docker compose build backend  && docker compose up -d backend    # kör migrationer + seed på nytt
docker compose logs -f backend                                    # följ loggar
```

| Uppgift | Kommando |
| --- | --- |
| **Ny migration** | Skapa filen i `backend/alembic/versions/` (kopiera formatet från en befintlig, kedja `down_revision` till nuvarande head). Källkod är **inte** bind-mountad — den byggs in vid `docker compose build backend` och körs vid nästa start. |
| **Kör migrationer manuellt** | `docker compose exec backend alembic upgrade head` (alembic finns i imagen). |
| **Lint (backend)** | Dev-verktygen ligger **inte** i runtime-imagen. Lokalt i `backend/` (venv): `pip install -e ".[dev]" && ruff check app`. |
| **Lint/typecheck (frontend)** | Körs automatiskt av `next build` — `docker compose build frontend` failar på lint-/typfel. Manuellt: lokalt i `frontend/` med `npm install && npm run lint`. |
| **Tester** | pytest är konfigurerat (`backend/pyproject.toml`, dev-deps) men ingen svit än; körs lokalt med `.[dev]` i en venv. |
| **Importera riktig data** | token-skyddade endpoints via skripten i [`scripts/`](scripts/) — se [ARCHITECTURE.md#datainflöden](docs/ARCHITECTURE.md#datainflöden). |

Data (HME/ekonomi/sjukfrånvaro) versionshanteras **aldrig** — den matas in via
import-endpoints. Utan den kör appen vidare med enbart referens- och dummydata.

## Projektstruktur

```
bbb/
├─ README.md                 # den här filen
├─ CLAUDE.md                 # projektregler/konventioner (visuellt språk, dataregel, faser)
├─ docker-compose.yml        # produktionsstack (Dokploy) — inga publicerade portar
├─ docker-compose.override.yml  # endast lokalt: publicerar frontend-porten
├─ .env.example              # alla miljövariabler (kopiera till .env)
├─ docs/
│  ├─ ARCHITECTURE.md        # arkitektur, datamodell, dataflöden, designbeslut
│  ├─ DEPLOY.md              # driftsättning via Dokploy (checklista)
│  ├─ BYGGPLAN.md            # ursprunglig byggplan + roadmap (§16–17)
│  └─ uppfoljningsdialog.html  # designprototyp
├─ backend/                  # FastAPI-app
│  ├─ app/
│  │  ├─ main.py             # app + router-registrering + /api/health
│  │  ├─ models.py           # SQLAlchemy-modeller
│  │  ├─ schemas.py          # Pydantic-scheman
│  │  ├─ routers/            # dialogues, kpi_areas, activities, import_data, admin, …
│  │  ├─ services/           # import-/domänlogik (hme, ekonomi, sjukfranvaro, …)
│  │  └─ seed.py             # idempotent seed (referensdata + dummydata)
│  ├─ alembic/versions/      # migrationer
│  └─ entrypoint.sh          # migrate → seed → gunicorn
├─ frontend/                 # Next.js-app (App Router)
│  ├─ app/                   # sidor (/, /dialog/[id], /status, /login, /admin/import)
│  ├─ components/            # Dashboard, DetailPanel, QuestionPanel, charts/, ui/, …
│  ├─ lib/                   # api-klient, auth, admin-api
│  ├─ tailwind.config.js + app/globals.css   # token-lagret (färger, spacing, klasser)
│  └─ public/brand/          # kommunens officiella logotyp
└─ scripts/                  # fristående importskript (Python-stdlib)
```

## Vidare läsning

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — hur allt hänger ihop: tjänster, request-flöde,
  datamodell, dataflöden, det visuella token-lagret och viktiga designbeslut/fallgropar.
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — driftsättning på `bbb.sundsvall.dev` via Dokploy.
- [`CLAUDE.md`](CLAUDE.md) — konventioner (svenskt UI, imperativ knapptext, token-regler, dataregel).
- [`docs/BYGGPLAN.md`](docs/BYGGPLAN.md) — ursprunglig byggplan och roadmap.
