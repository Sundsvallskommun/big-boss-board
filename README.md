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
- [Datainläsning](#datainläsning)
- [Projektstruktur](#projektstruktur)
- [Vidare läsning](#vidare-läsning)

## Stack

| Lager | Teknik |
| --- | --- |
| **Frontend** | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 + ett eget litet token-lager (Sundsvalls visuella språk). Standalone-output. |
| **Backend** | FastAPI · SQLAlchemy 2.0 (async) · Pydantic v2 · Alembic. Uvicorn-workers via Gunicorn. Alla endpoints under `/api`, OpenAPI på `/api/docs`. |
| **Databas** | PostgreSQL 16 (namngiven volym, ej publik). |
| **Infra** | OpenShift-anpassade containrar med kommunens SAML/Redis. Compose/Dokploy finns som separat körväg. Frontend proxar `/api/*` → backend. |

> Obs: `@sk-web-gui` (Sundsvalls designsystem-paket) används **inte** — utseendet är
> återskapat i ett eget token-lager. Se [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#visuellt-token-lager).

## Kom igång lokalt

**Förkrav:** Docker Engine + Docker Compose v2. (Node 22 / Python 3.12 behövs bara om du
vill köra en tjänst utanför Docker eller köra importskripten.)

```bash
git clone https://github.com/Sundsvallskommun/big-boss-board.git
cd big-boss-board
cp .env.example .env          # sätt POSTGRES_PASSWORD (och matcha den i DATABASE_URL)
# sätt ACCESS_CODE och SESSION_SECRET, eller ALLOW_OPEN_ACCESS=true för öppen lokal/demo
docker compose up --build -d
# Vänta tills backend har startat. Bara för en ny, tom databas, före första användning:
docker compose exec backend python -m app.seed
```

`docker compose up` laddar automatiskt `docker-compose.override.yml`, som publicerar
frontend-porten lokalt. Backend kör **migrationer** innan Gunicorn startar
(se `backend/entrypoint.sh`). Referensdata och dialoger skapas separat med kommandot
ovan, i en enda transaktion och bara om hela appdatabasen är tom. Finns redan data
gör kommandot ingenting. Mätvärden importeras uttryckligen via API eller CLI;
inga dummyvärden eller datafiler läses in vid uppstart.

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

### Inloggning

Kommunens SAML-läge styrs av `AUTH_MODE=saml`; sessioner och behörigheter ägs av
backend. Se [SAML-kontraktet](docs/SAML_SSO_PLAN.md). Följande åtkomstkodsläge gäller
lokal/demo-körning.

### Åtkomstkod

Sätt `ACCESS_CODE` i `.env` för vanlig inloggning. `ADMIN_ACCESSCODE` ger dessutom
inkorgen på statussidan. Kodinloggning kräver även `SESSION_SECRET` med minst
32 tecken (skapa med `openssl rand -hex 32`); cookien innehåller en signerad session
som gäller i åtta timmar. SAML använder fortsatt backendens separata `SECRET_KEY`.
Tomma koder släpper inte längre igenom trafik av
misstag; för en helt öppen lokal/demo-körning krävs `ALLOW_OPEN_ACCESS=true`
uttryckligen. Sätt aldrig den flaggan i drift.

## Vanliga utvecklingsuppgifter

Snabb iterationsloop (bygg om + starta bara den ändrade tjänsten):

```bash
docker compose build frontend && docker compose up -d frontend   # efter frontend-ändring
docker compose build backend  && docker compose up -d backend    # kör eventuella nya migrationer
docker compose logs -f backend                                    # följ loggar
```

| Uppgift | Kommando |
| --- | --- |
| **Ny migration** | Skapa filen i `backend/alembic/versions/` (kopiera formatet från en befintlig, kedja `down_revision` till nuvarande head). Källkod är **inte** bind-mountad — den byggs in vid `docker compose build backend` och körs vid nästa start. |
| **Kör migrationer manuellt** | `docker compose exec backend alembic upgrade head` (alembic finns i imagen). |
| **Lint (backend)** | Dev-verktygen ligger **inte** i runtime-imagen. Lokalt i `backend/` (venv): `pip install -e ".[dev]" && ruff check app`. |
| **Typkontroll (frontend)** | Körs automatiskt av `next build` — `docker compose build frontend` failar på typfel. Manuellt: lokalt i `frontend/` med `npm install && npm run typecheck`. |
| **Tester** | Riktade pytest-prov i `backend/tests/` och Node-prov i `frontend/tests/`. Se arkitekturdokumentets testavsnitt. |
| **Importera riktig data** | token-skyddade endpoints via skripten i [`scripts/`](scripts/) — se [Datainläsning](#datainläsning) nedan. |

## Datainläsning

Import sker via API eller CLI; appen har ingen importvy. I kommunens drift nås
API-dokumentationen efter inloggning på [chefdialog.sundsvall.se/api/docs](https://chefdialog.sundsvall.se/api/docs).
Import-API:erna använder en separat Bearer-token och kräver ingen SAML-session.
Se [endpoints, format och kommandon](docs/ARCHITECTURE.md#api-åtkomst-i-kommunens-drift).

Ordningen spelar roll: **organisationerna (förvaltningarna) är master** och måste finnas
först — nyckeltalen **kopplas** till dem via masterdata-koden (`orgId`), de skapar dem inte.

### 1. Organisationer — initiera en ny databas

Förvaltningslistan bor i **[`backend/app/seed_data/organisationer.json`](backend/app/seed_data/organisationer.json)**
och används som mall av `python -m app.seed` vid uttrycklig initiering av en **tom databas**.
Efter initiering äger databasen organisationerna. `orgId` motsvarar `organisation.kod`,
som importer kopplar mot. Format:

```json
{
  "meta": { "beskrivning": "…", "version": "1.0", "senastUppdaterad": "2026-07-03" },
  "organisationer": [
    { "orgId": 23, "namn": "Vård och omsorgsförvaltningen" },
    { "orgId": 24, "namn": "Barn och utbildningsförvaltning" }
  ]
}
```

Initieringen skapar organisationer, en dialog per organisation och referensdata utan
mätvärden. Den uppdaterar eller raderar aldrig befintliga rader. Ändringar i mallfilen
påverkar endast nya installationer. Befintliga organisationer och dialogfrågor ändras
genom en separat granskad datamigrering; statusinnehåll kan redigeras via admin-API:t.
En omstart återställer inte redigeringar eller borttaget innehåll.

### 2. Nyckeltal — importeras och kopplas på koden

HME, Ekonomi och Sjukfrånvaro matas in via token-skyddade endpoints (`IMPORT_TOKEN`) med skripten
i [`scripts/`](scripts/). De **upsertar** (säkra att köra om) och matchar varje rad mot rätt
förvaltning på masterdata-koden (`orgId` / CSV:ns `Enhet`). Rådatan versionshanteras aldrig.

```bash
IMPORT_TOKEN=… python3 scripts/import_hme.py          --file hme-indata/HME_totalindex_medorg.json --url http://localhost:3000
IMPORT_TOKEN=… python3 scripts/import_ekonomi_serie.py --dir ekonomi-indata      --url http://localhost:3000
IMPORT_TOKEN=… python3 scripts/import_sjukfranvaro.py  --dir sjukfranvaro-indata --url http://localhost:3000
```

| Källa | Format | Kopplas på |
| --- | --- | --- |
| HME | JSON (`dimensioner.Enhet` med `orgId`) | `orgId` (annars namn/slug för äldre filer) |
| Ekonomi | Qlik-CSV per period (månadsserie) | `Enhet` = kod |
| Sjukfrånvaro | Qlik personal-CSV per period | `Enhet` = kod |

Rader vars kod saknar en förvaltning i mastern **hoppas över** (skapar inget). Utan import
kör appen vidare med fiktiva platshållar-mätvärden tills riktig data lästs in. Fördjupning:
[`docs/ARCHITECTURE.md#datainflöden`](docs/ARCHITECTURE.md#datainflöden).

## Projektstruktur

```
bbb/
├─ README.md                 # den här filen
├─ AGENTS.md                 # gemensamma projektregler/konventioner
├─ CLAUDE.md                 # hänvisning till AGENTS.md
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
│  │  ├─ seed.py             # explicit initiering av tom databas, utan mätvärden
│  │  └─ seed_data/           # organisationer.json (förvaltnings-master, orgId = kod)
│  ├─ alembic/versions/      # migrationer
│  └─ entrypoint.sh          # migrate → gunicorn
├─ frontend/                 # Next.js-app (App Router)
│  ├─ app/                   # sidor (/, /dialog/[id], /status, /login)
│  ├─ components/            # Dashboard, DetailPanel, QuestionPanel, charts/, ui/, …
│  ├─ lib/                   # api-klient, auth, admin-api
│  ├─ app/globals.css (@theme)   # token-lagret (färger, spacing, klasser)
│  └─ public/brand/          # kommunens officiella logotyp
└─ scripts/                  # fristående importskript (Python-stdlib)
```

## Vidare läsning

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — hur allt hänger ihop: tjänster, request-flöde,
  datamodell, dataflöden, det visuella token-lagret och viktiga designbeslut/fallgropar.
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — driftsättning på `bbb.sundsvall.dev` via Dokploy.
- [`docs/OPENSHIFT_PROD_PLAN.md`](docs/OPENSHIFT_PROD_PLAN.md) — plan för GitHub → Tekton →
  GitLab-manifest → ArgoCD → OpenShift.
- [`docs/SAML_SSO_PLAN.md`](docs/SAML_SSO_PLAN.md) — plan för SAML/SSO, sessioner och gruppstyrning.
- [`docs/EXTERNAL_DATABASE_PLAN.md`](docs/EXTERNAL_DATABASE_PLAN.md) — plan för extern intern
  Postgres i prod.
- [`AGENTS.md`](AGENTS.md) — konventioner (svenskt UI, imperativ knapptext, token-regler, dataregel).
- [`docs/BYGGPLAN.md`](docs/BYGGPLAN.md) — ursprunglig byggplan och roadmap.

## Införande av uppdaterade nyckeltal

Budget–prognos, sjukfrånvaro R12, HME-delindex och organisationsspecifika frågor beskrivs
med sina importkontrakt i [arkitekturen](docs/ARCHITECTURE.md#datainflöden).
Migrationer, underlag och återställning beskrivs i
[driftdokumentationen](docs/DEPLOY.md#införa-nyckeltalsuppdateringen).
