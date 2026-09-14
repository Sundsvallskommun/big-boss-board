# Arkitektur — Big Boss Board (bbb)

Teknisk översikt för utvecklare. För att komma igång, se [`../README.md`](../README.md).
För konventioner (visuellt språk, svenskt UI, dataregel), se [`../AGENTS.md`](../AGENTS.md).

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

Kommunens drift använder OpenShift-anpassade containrar, SAML och Redis. Se
[OpenShift-planen](OPENSHIFT_PROD_PLAN.md) och [SAML-kontraktet](SAML_SSO_PLAN.md).
Nedanstående nätverksbild visar den separata Compose/Dokploy-körvägen med tre tjänster. Endast **frontend** är publik; den proxar
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
| `backend` | `./backend` (Python 3.12-slim) | `8000` (internt) | `entrypoint.sh`: migrate → gunicorn (uvicorn-workers). |
| `frontend` | `./frontend` (Node 22 **bookworm-slim**) | `3000` (internt; publik via Traefik) | Next standalone. Healthcheck är node-baserad. |

Lokalt lägger [`../docker-compose.override.yml`](../docker-compose.override.yml) till en
host-port för `frontend` (`FRONTEND_PORT`). Dokploy använder **enbart** `docker-compose.yml`.

## Request-flöde (en domän)

- **Sidladdning:** webbläsaren → Traefik → frontend. Sidorna är Server Components med
  `export const dynamic = "force-dynamic"` och hämtar data **server-side** direkt mot
  backend på det interna nätet (`BACKEND_INTERNAL_URL`, default `http://backend:8000`).
- **Klient-anrop:** webbläsarens `fetch("/api/…")` går till frontend, som via
  `next.config` **rewrites** proxar `/api/*` → backend. Samma domän → inga CORS.
- **Access-gate:** `frontend/middleware.ts` kontrollerar SAML-sessionen via `/api/me`
  i kommunens `AUTH_MODE=saml`. Åtkomstkakor används endast i `access_code`-läget. `/api/import/*` och `/api/admin/*` **undantas** —
  de är maskin-till-maskin och har egen token-auth (`IMPORT_TOKEN`). `/brand` (loggan)
  är också undantagen (publik).
- **Robusthet:** `frontend/lib/api.ts` (`fetchJson`) har timeout + retry på server-fetchar;
  varje route har `loading.tsx`/`error.tsx`. Se [fallgropar](#viktiga-designbeslut--fallgropar).
- **Tokenkontroll före kropp:** import- och adminroutrarna använder `ImportTokenRoute`
  i `app/auth/import_token.py`. Samma ägare validerar tokenen innan FastAPI läser JSON;
  OpenAPI beskriver Bearer-auth. Inget separat proxyfilter tar bort SAML-cookies.
- **Kodsession:** `lib/access-session.ts` signerar roll, nonce och 8 timmars giltighet
  med `SESSION_SECRET`. Den delade koden skickas aldrig som cookie. Samma verifiering
  används av middleware och adminvyer; kod-/nyckelrotation ogiltigförklarar sessionerna.
  SAML:s sessionsägare, cookie och `SECRET_KEY` är separata.
- **Loginspärr:** tio försök per klient och kvart, reserverade före asynkront arbete.
  IP hämtas ur betrodd sista `X-Forwarded-For`; IPv6 grupperas per /64. Räknarna är
  minnesbegränsade och lokala per frontend-process. För access_code över flera repliker
  behövs även gemensam begränsning i ingressen; SAML:s backendspärr är oförändrad.
- **Headers:** Next sätter CSP för inbäddning, objekt och bas-URL samt nosniff,
  referrer-/permissions-policy och HSTS. CSP begränsar inte formulärens externa
  omdirigeringar, eftersom IdP-adressen konfigureras först vid containerstart.

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
  Har `status` (good/warn/alert eller null när underlag saknas), värde/mål, trend och en fri `details`-JSON (t.ex. HME-serie,
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
Nyinitierade dialoger saknar mätvärden. Befintliga mätvärden rensas aldrig vid uppstart
eller initiering. Manuell status sätts i dialogflödet: `POST /api/dialogues/{id}/areas/{area_id}/status` (append).

Bakgrund/roadmap för dialog-only-nyckeltalen finns i [`BYGGPLAN.md`](BYGGPLAN.md) §16–17.

## Datainflöden

**Organisationerna är master** (BYGGPLAN §18): förvaltningslistan bor i
[`../backend/app/seed_data/organisationer.json`](../backend/app/seed_data/organisationer.json)
(`orgId` = `organisation.kod`) som mall för uttrycklig initiering av en tom databas.
Därefter äger databasen organisationerna. Nyckeltalen nedan **kopplar** mot dessa via
koden — de skapar aldrig förvaltningar. Malländringar påverkar inte befintliga rader;
organisationsändringar i drift kräver en separat granskad datamigrering.

Riktig data (HME, ekonomi, sjukfrånvaro) **versionshanteras aldrig** och matas in via
token-skyddade endpoints (`IMPORT_TOKEN`). Alla är **idempotenta upsertar** — säkra att
köra om. Skripten i [`../scripts/`](../scripts/) använder enbart Python-stdlib.

| Nyckeltal | Endpoint(s) | Skript | Källformat |
| --- | --- | --- | --- |
| HME | `POST /api/import/hme-rapport` (rapport + valfria delindex), `/hme` (normaliserat) | `import_hme.py` | JSON (officiell rapport) |
| Ekonomi | `POST /api/import/ekonomi-filer` (webb/CLI), `/ekonomi`, `/ekonomi-csv`, `/ekonomi-serie` | `import_ekonomi.py`, `import_ekonomi_serie.py` | Qlik-CSV (månadsserie ur flera dagsuttag) |
| Sjukfrånvaro | `POST /api/import/sjukfranvaro-filer` (webb/CLI), `/sjukfranvaro-csv` | `import_sjukfranvaro.py` | Qlik personal-CSV (senaste uttag per period) |

```bash
# Exempel (kör mot lokal instans eller prod):
IMPORT_TOKEN=… python3 scripts/import_ekonomi_serie.py --url http://localhost:3000
IMPORT_TOKEN=… python3 scripts/import_sjukfranvaro.py --dir sjukfranvaro-indata --url http://localhost:3000
```

Nyckeln kopplas till rätt förvaltning via masterdata-koden (`organisation.kod` ↔ CSV:ns
`Enhet`). Backend äger normalisering och urval; skripten transporterar underlaget.

- **Ekonomi:** prognos minus helårsbudget för nettokostnad `SK.EK.RR.005`, i mnkr.
  `services/ekonomi.py` äger bedömningen vid både import och läsning. Negativ diff är
  underskott. Noll eller saknad budget/prognos ger ingen bedömning. Filurvalet prioriterar
  senaste uttag dag 1–9 månaden efter rapportperioden, annars senaste tillgängliga uttag.
  Fil- och enkelperiodimport uppdaterar angivna månader och bevarar övrig historik samt
  senaste huvudvärde. `/ekonomi-serie` är en uttrycklig ersättning av serien.
  Varje förvaltnings senaste tillgängliga period används, även om den saknas i sista filen.
  En tidsbegränsad aprilrättning för kod 24 fyller endast saknad prognos vid den dokumenterade
  budgeten; ett faktiskt källvärde har företräde. Regeln och beslutskällan finns i `ekonomi.py`.
- **Sjukfrånvaro:** R12, grön ≤6 %, gul >6–7,5 %, röd >7,5 % eller ökning >1,5
  procentenheter på exakt tre månader. Gammalt aggregat blandas inte med R12 och visas
  neutralt tills nytt underlag importerats. CSV-formatets personalmått `SK.P.AM.` används
  som formatmarkör; kontrollera mot dataägaren att produktionsuttaget faktiskt avser R12.
  Importerat personalantal används i kostnadsschablonen; saknat antal använder en daterad
  reservtabell. Noll anställda ersätts aldrig med reservantal. Uppskattningen är
  antal × R12-procent × 3 000 kr per år, inte bokförd kostnad eller säker besparing.
- **HME:** total och delperspektiv har egna årsserier. Import av enbart totalen bevarar
  befintliga perspektiv; en explicit tom perspektivkarta i `/hme` rensar dem. Årsangivelsen
  på varje perspektivkort visar om underlaget är äldre än totalens. Helt undertryckta
  enheter hoppas över och räknas i importresultatet.
- **Importvalidering:** felaktiga datum, ogiltiga/icke-ändliga tal och andelar utanför
  0–100 avvisas före skrivning. Filer kan skickas som CSV/TXT med BOM. Webbens och
  flerfils-API:ts gräns är 100 filer och 15 MB totalt.
- **Organisationer och frågor:** mastern skiljer förvaltning från bolag/förbund.
  `dialogbaserad` anger vilka nyckeltal som följs upp med egna frågor; dessa ersätter
  områdets allmänna frågor för just organisationen. Övriga frågor påverkas inte.
  `rubrik` etiketterar frågan, `bygger_pa` anger enkätursprung.
- **Statusrapporter:** `aterstaende` lagrar återstående aktiviteter, separat från `punkter`.
  Befintligt publicerings-API äger både fälten.

**Status-sidan** (`/status`) har egna vägar: en publik inkorg (`POST /api/submissions`,
gatas av access-koden) och token-skyddad triage/publicering (`/api/admin/...`).

## Migrationer & seed

`backend/entrypoint.sh` kör vid **varje** start:

1. `alembic upgrade head` — migrationer i [`../backend/alembic/versions/`](../backend/alembic/versions/) (kedjad revisionshistorik).
2. Gunicorn — startas endast om migrationerna lyckas.

`python -m app.seed` är ett **separat engångskommando**, före första användning av en ny
installation. Kommandot kontrollerar samtliga apptabeller. Finns någon rad avslutas det
utan ändringar, även om andra tabeller är tomma. Alembics revisionstabell ingår inte i
kontrollen. En enda transaktion skapar referensdata, organisationer, dialoger och initialt
statusinnehåll; fel rullar tillbaka hela initieringen. Inga mätvärden skapas och inga
rapportfiler läses. Kör initieringen en gång utan samtidig användartrafik.

Efter initiering äger databasen innehållet. Importer sker via webb/CLI och befintliga
importtjänster. Ändringar i organisationer, frågor och övrig referensdata behöver en
uttrycklig, granskad datamigrering; att redigera seed-mallar ändrar bara nya installationer.
Statuskort och rapporter kan redigeras via sina admin-API:er. Seed återställer aldrig
borttaget innehåll och används inte för reparation av en delvis fylld databas.

Ny migration: lägg en fil i [`../backend/alembic/versions/`](../backend/alembic/versions/) —
kopiera formatet från en befintlig och kedja `down_revision` till nuvarande head. Källkoden är
**inte** bind-mountad (den byggs in i imagen via `COPY`), så migrationen byggs in vid
`docker compose build backend` och körs vid start. Enum-typen `status` (good/warn/alert) finns
redan i DB:n — referera den med `create_type=False` i nya tabeller (se `8b3c4d5e6f07_area_status.py`).

## Visuellt token-lager

Frontend hämtar Sundsvalls **visuella grundintryck** men implementerar det i ett **eget,
litet token-lager** — `@sk-web-gui` används inte. Tailwind 4-tokens och CSS-bas bor i en fil:

- `frontend/app/globals.css` — `@theme` för färger, spacing (`--spacing: 1px`), radie och typografi, samt CSS-bas och komponentklasser.

Markupen använder token-utilities (`bg-background-content`, `text-dark-secondary`,
`vattjom-surface-primary`, status-tokens via `components/status.ts`). **Skriv aldrig ny hex
i sid-markup** — använd en token-utility, lägg värdet i globals.css om det saknas. Lokala
UI-primitiver finns i `frontend/components/ui/`. Fullständiga regler i [`../AGENTS.md`](../AGENTS.md).

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
- **Endast migrationer körs vid varje backend-start; seed körs separat för tom databas.** En trasig migration blockerar starten
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
| `BACKEND_INTERNAL_URL` | frontend | Intern backend-URL för SSR/rewrites (default `http://backend:8000`). |
| `ACCESS_CODE` | frontend + backend | Åtkomstkod. Tom kod kräver `ALLOW_OPEN_ACCESS=true`, annars fail-closed. |
| `SESSION_SECRET` | frontend | Minst 32 tecken för signerade kodsessioner. Krävs när koder används, även lokalt; samma värde på alla frontend-repliker. Används inte av SAML. |
| `ALLOW_OPEN_ACCESS` | frontend | Explicit lokal/demo-flagga för öppen access. Ska aldrig vara `true` i drift. |
| `ADMIN_ACCESSCODE` | frontend | Admin-kod som dessutom visar import-GUI:t (`/admin/import`). |
| `NODE_ENV` / `PORT` | frontend | Standard `production` / `3000`. |
| `FRONTEND_PORT` | (lokalt) | Host-port i override-filen. Används inte i Dokploy. |

## Tester

Riktade backendtester finns i `backend/tests/` (pytest, pytest-asyncio, httpx och
SQLite i minnet för produktkontrakt). Frontendens `tests/` innehåller Node-prov av
API-transport, import, komponentmarkup, tema och middleware. SQLite-proven ersätter
inte migrationsprov med PostgreSQL; markupprov ersätter inte webbläsargranskning.

Dev-verktyg installeras lokalt via backendens `.[dev]` och frontendens `npm ci`.
Typkontroll: `frontend/node_modules/.bin/tsc --noEmit --incremental false -p frontend/tsconfig.json`.
Riktade prov från reporoten:

```sh
backend/.venv/bin/python -m pytest backend/tests/test_ekonomi_import.py backend/tests/test_product_imports.py -q
node --experimental-transform-types --test --test-concurrency=1 frontend/tests/product.test.mjs
node --test --test-concurrency=1 frontend/tests/review.test.cjs frontend/tests/middleware.test.cjs frontend/tests/theme.test.mjs
```

På utvecklings-Macen körs varje test, typkontroll, installation och bygge genom den
globala resurssupervisorn enligt arbetsmiljöns instruktioner. Fullständiga byggen,
serverstarter och webbläsartester körs endast efter uttrycklig begäran.
