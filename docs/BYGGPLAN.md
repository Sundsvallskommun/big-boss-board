# Byggplan — Dialogstöd för chefsuppföljning

Arbetsnamn (internt, ej i UI): **Big Boss Board (bbb)**. Publik domän: `bbb.sundsvall.dev`.
Den här planen beskriver hur prototypen (`uppfoljningsdialog.html`) byggdes om till en skalbar
fullstack-app med Python-backend, PostgreSQL och en frontend i Sundsvalls visuella språk (eget
token-lager) — driftsatt som Docker-stack via Dokploy.

---

## Status & nuläge

Appen är **byggd och i drift** på `bbb.sundsvall.dev` (faserna 0–5 klara). Den här filen är den
ursprungliga byggplanen + en levande roadmap. **För aktuell teknisk sanning, se
[`ARCHITECTURE.md`](ARCHITECTURE.md), [`DEPLOY.md`](DEPLOY.md) och [`../README.md`](../README.md)** —
§1–§14 nedan är den ursprungliga planen (som byggd, med avvikelserna nedan); §16– är roadmap.

Viktiga **avvikelser/tillägg** sedan grundplanen:

- **Eget token-lager, inte `@sk-web-gui`.** Designsystemets utseende återskapades i ett litet eget
  Tailwind-token-lager + lokala UI-primitiver (`components/ui/`); `@sk-web-gui` avkopplades.
  Statusfärgerna är en dokumenterad trafikljusskala (good/warn/alert) i `components/status.ts`.
- **Datamodell utökad.** `agreement` ersatt av `activity` (aktiviteter/åtgärder per område). Nya
  tabeller: `area_status` (manuell status, historik), `submission` (inkorg), `status_fraga` +
  `statusrapport` (status-sidan). `organisation.kod` (masterdata) och `kpi_area.info` tillkom.
- **Fler dataflöden.** Ekonomi och sjukfrånvaro importeras (token-skyddade CSV-endpoints + skript i
  `scripts/`), utöver HME. Nyckeltal ↔ förvaltning kopplas via masterdata-koden.
- **Status-sida + inkorg** (`/status`, `/status/skicka-in`) med kurerat innehåll i DB.
- **Dialog-only-nyckeltal** (Verksamhet, Digital transformation, Kommunikativt ledarskap): inga
  mätvärden — dialogfrågor + manuellt satt status/kommentar med historik (§16–17, byggt).
- **UI:** "norra stjärnan"-rutan (Effekt/Resultat) borttagen; header i Verktyg-stil med officiell
  logotyp; responsiv KPI-strip (alla sex kort på en rad på breda skärmar).
- **Driftshärdning:** frontend på **glibc**-basimage (musl-DNS-fallgrop), diagram `ssr:false`,
  loading/error-gränser + timeout på server-fetchar. Detaljer i `ARCHITECTURE.md`.

---

## 1. Mål och omfattning

- Behålla prototypens UX och innehåll: norra stjärnan (Effekt/Resultat + mätare), KPI-strip med statusfärger, dialogpanel med samtalsstöd, verktygslåda och överenskommelser, progress.
- Göra datan **dynamisk**: KPI-områden, värden, verktygslådor, frågor och överenskommelser kommer från ett API + databas i stället för hårdkodad JS.
- Köra på **dummydata** från start (seed), men med en datamodell och ett API som håller för riktig data senare.
- Frontend ska använda **det riktiga designsystemet** (`@sk-web-gui/react` + `@sk-web-gui/core`), inte den handrullade CDN-spegeln.
- Driftas som **Docker Compose-stack via Dokploy** på `bbb.sundsvall.dev`.

Utanför scope i v1 (men förberett för): inloggning mot riktig IdP, integration mot verkliga källsystem (Public 360, ekonomisystem m.m.), rollstyrning. Access-kod-login byggs som enkel stub.

---

## 2. Arkitektur (översikt)

```
                         bbb.sundsvall.dev (HTTPS)
                                  │
                        Dokploy / Traefik (TLS via Let's Encrypt)
                                  │
                          ┌───────▼────────┐
                          │   frontend     │  Next.js 15 (standalone)
                          │  @sk-web-gui   │  serverar UI + proxar /api → backend
                          └───────┬────────┘
                                  │ internt nätverk (compose)
                          ┌───────▼────────┐
                          │    backend     │  FastAPI (Python), Uvicorn/Gunicorn
                          │   REST /api    │
                          └───────┬────────┘
                                  │
                          ┌───────▼────────┐
                          │   db (postgres)│  volym för persistens, ej publik
                          └────────────────┘
```

- **Endast `frontend` exponeras publikt.** Backend och databas ligger på det interna compose-nätverket. Frontend proxar `/api/*` till backend via Next.js `rewrites` (en enda domän, inga CORS-bekymmer).
- Postgres får **ingen publik port** — bara intern access + namngiven volym.

---

## 3. Teknikval och motivering

**Frontend — Next.js 15 (App Router) + React 19 + TypeScript**
Matchar designsystemets stack exakt (ui.sundsvall.dev anger Next.js 15 / React 19). `@sk-web-gui/react` ger riktiga komponenter (Button, FormControl, Input, Textarea, Alert, Logo, Divider, Spinner). `@sk-web-gui/core` registrerar alla CSS-variabler i `:root` + Tailwind-preset, så vi slipper hårdkoda hex. Standalone-output gör Docker-imagen liten.

**Backend — FastAPI (Python) + SQLAlchemy 2.0 + Pydantic v2 + Alembic**
FastAPI ger async, typade endpoints, auto-genererad OpenAPI (`/api/docs`) och validering via Pydantic — bra grund för skalbarhet. SQLAlchemy 2.0 som ORM, Alembic för migrationer, så schemat versioneras. Körs med Uvicorn (Gunicorn-workers i prod).

**Databas — PostgreSQL 16**
Officiell image, namngiven volym, healthcheck. Migrationer + seed körs vid deploy.

**Infra — Docker Compose via Dokploy**
Dokploy bygger på Docker + Traefik och stödjer Compose-deploys: peka mot Git-repo, sätt domän + env i Dokploy-UI, så injiceras Traefik-labels och TLS automatiskt.

---

## 4. Datamodell

Föreslaget schema (Postgres). Referenstabeller (areor, stödfunktioner, verktyg, frågor) gör innehållet redigerbart utan kodändring; transaktionstabeller (dialoger, mätvärden, överenskommelser) bär själva uppföljningen.

| Tabell | Nyckelkolumner | Kommentar |
|---|---|---|
| `organisation` | id, namn, slug | t.ex. "Kommunstyrelsekontoret" |
| `person` | id, namn, roll, initialer | ansvarig chef m.fl. (fiktiv dummydata) |
| `support_function` | id, key, namn, ikon | Ekonomi, HR, Kommunikation, Verksamhet, Digitalisering |
| `tool` | id, support_function_id (fk), namn, ordning | verktygslådans poster |
| `kpi_area` | id, key, namn, ikon, lower_better (bool), support_function_id (fk), ordning | de sex områdena |
| `question` | id, kpi_area_id (fk), text, ordning | samtalsstöd per område |
| `dialogue` | id, organisation_id (fk), ansvarig_chef_id (fk), period, status, skapad_at | en uppföljningsdialog |
| `measurement` | id, dialogue_id (fk), kpi_area_id (fk), value_text, value_num, target_text, status (enum good/warn/alert), trend_dir (up/down), trend_good (bool), trend_text | utfall per område och dialog |
| `agreement` | id, dialogue_id (fk), kpi_area_id (fk), text, ansvarig, klart_senast (date), genomgangen (bool), updated_at | överenskommelse/nästa steg |

Status modelleras som enum (`good`/`warn`/`alert`) skild från färg, så att färgsättningen bestäms i frontend mot designsystemet (se 6, statusfärger).

---

## 5. API-design (FastAPI, prefix `/api`)

Läs:
- `GET /api/dialogues` — lista dialoger (org, chef, period, status, progress).
- `GET /api/dialogues/{id}` — full dialog: areor + mätvärden + verktyg + frågor + överenskommelser. Detta är det enda anrop frontend behöver för dashboarden.
- `GET /api/kpi-areas` — referensdata (areor med stödfunktion, verktyg, frågor).
- `GET /api/health` — healthcheck för compose/Dokploy.

Skriv:
- `PUT /api/agreements/{id}` — spara text/ansvarig/datum.
- `POST /api/dialogues/{id}/areas/{areaId}/agreement` — skapa/uppdatera överenskommelse (upsert).
- `PATCH /api/dialogues/{id}/areas/{areaId}` — markera genomgången/ångra.

Allt typas med Pydantic-scheman; OpenAPI exponeras på `/api/docs`. Svar formas så att frontend kan rendera utan efterbearbetning (samma form som dagens `AREAS`-objekt).

---

## 6. Frontend — mappning från prototyp till designsystem

Ersätt den handrullade CSS:en med riktiga komponenter:

| Prototyp (idag) | Produktion (@sk-web-gui) |
|---|---|
| `.btn .btn-primary` | `<Button color="vattjom" variant="primary">` (verb i imperativ) |
| `.btn-secondary` | `<Button color="vattjom" variant="secondary">` |
| `.sk-label` + `.sk-input` | `<FormControl><FormLabel/>…<Input/>` resp. `<Textarea/>` |
| info-ruta (ochre) | `<Alert type="warning">` |
| inbäddad logo-SVG | `<Logo variant="logo" />` (svart variant), aldrig modifierad |
| avdelare | `<Divider orientation="vertical" strong />` |
| ikoner (Lucide via CDN) | `<LucideIcon name={…} />` från `@sk-web-gui/react` + `lucide-react` |

Behåll som **bespoke** (finns ej i SK): mätaren/gauge (SVG), KPI-kortens layout, dialogpanelen. Bygg dem med SK:s tokens (CSS-variabler/Tailwind-preset), inte egna hex.

**Statusfärger — designbeslut att lösa tidigt.** Designsystemets semantiska status är `success #00733b`, `warning #b6620c`, `info #005595` och `error #a90074` (magenta, inte röd). Trafikljusmodellen i prototypen (grön/gul/röd) saknar alltså en exakt "röd" i systemet. Bestäm med design: antingen (a) använd SK:s semantiska tokens rakt av, eller (b) definiera en dokumenterad KPI-statusskala som ett tillägg ovanpå primitiverna. Hårdkoda inte hex oavsett vilket.

Typografi: Raleway (rubriker) + Arial (brödtext) enligt systemet — Raleway självhostas eller laddas via Google Fonts (laddas ej av `@sk-web-gui/core`).

---

## 7. Dummydata / seed

- Seed-skript (Python) som fyller referensdata (6 areor, 5 stödfunktioner, verktyg, frågor) + en exempeldialog (Kommunstyrelsekontoret, Lennart Andersson, T1 2026) med mätvärden motsvarande prototypen (Ekonomi 72, HME 77, Sjukfrånvaro 6,6 %, Kommunikativt ledarskap 71, Verksamhet 62, Digital transformation 58).
- Endast **fiktiva** personer/uppgifter. Bär över regeln: appen används bara för **öppen och publik information** — inga personuppgifter eller känsliga uppgifter i dummydatan.
- Idempotent seed (kör säkert om och om), triggas i backend-entrypoint efter migration.

---

## 8. Projektstruktur (monorepo)

```
bbb/
├─ CLAUDE.md                 # projektminne för Claude Code (regler + faser)
├─ docker-compose.yml
├─ .env.example              # alla env-nycklar (utan värden)
├─ docs/
│  ├─ BYGGPLAN.md            # denna fil
│  └─ DESIGN.md              # befintliga designregler
├─ frontend/
│  ├─ Dockerfile
│  ├─ next.config.js         # output: 'standalone' + rewrites /api
│  └─ app/ … components/ …
└─ backend/
   ├─ Dockerfile
   ├─ pyproject.toml
   ├─ alembic/               # migrationer
   ├─ app/
   │  ├─ main.py             # FastAPI-app
   │  ├─ models.py db.py     # SQLAlchemy
   │  ├─ schemas.py          # Pydantic
   │  ├─ routers/            # endpoints
   │  └─ seed.py
   └─ entrypoint.sh          # migrate + seed + start
```

---

## 9. Docker & Compose

Riktlinjer (Dokploy hanterar exponering/TLS, så undvik publicerade portar på interna tjänster):

- **db**: `postgres:16-alpine`, namngiven volym, `healthcheck` (pg_isready), ingen `ports:` (bara `expose`).
- **backend**: byggs från `./backend`, multi-stage (slim Python), `depends_on: db (condition: service_healthy)`, läser `DATABASE_URL`, kör `entrypoint.sh` (alembic upgrade → seed → gunicorn -k uvicorn). `expose: 8000`, ingen publik port.
- **frontend**: byggs från `./frontend`, Next standalone, `expose: 3000`, läser intern backend-URL (`BACKEND_INTERNAL_URL=http://backend:8000`) för server-side rewrites. Endast den här tjänsten får domän i Dokploy.
- Sätt `restart: unless-stopped` och healthchecks på alla tjänster.

---

## 10. Deploy via Dokploy (bbb.sundsvall.dev)

1. Pusha repot till Git (GitHub/intern Git som Dokploy når).
2. I Dokploy: skapa en **Compose**-applikation och peka på repot + `docker-compose.yml`.
3. Sätt **domän** `bbb.sundsvall.dev` mot `frontend`-tjänsten (port 3000). Dokploy injicerar Traefik-labels och ordnar Let's Encrypt-TLS.
4. Lägg **env/secrets** i Dokploy (committa aldrig): `POSTGRES_PASSWORD`, `POSTGRES_USER`, `POSTGRES_DB`, `DATABASE_URL`, ev. `ACCESS_CODE`.
5. Säkerställ **persistent volym** för Postgres (Dokploy/Docker-volym).
6. Deploya. Verifiera: `https://bbb.sundsvall.dev` laddar, `/api/health` svarar via proxy, dialogen visas med seedad data.

DNS: `bbb.sundsvall.dev` ska peka på Dokploy-värden innan TLS kan utfärdas.

---

## 11. Konfiguration (env-nycklar)

`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `BACKEND_INTERNAL_URL`, `ACCESS_CODE` (stub-login), `NODE_ENV`, `PORT`. Allt dokumenteras i `.env.example`; riktiga värden bara i Dokploy.

---

## 12. Säkerhet, tillgänglighet, GDPR

- **Endast öppen/publik information** — visas som Alert i UI och gäller även dummydata.
- **Tillgänglighet (WCAG 2.2 AA)**: synligt fokus (`--color-semantic-focus`, ≥2 px), tangentbordsnavigering, `<label>` på fält, ikon-knappar med `aria-label`, `prefers-reduced-motion`, kontrast ≥4.5:1. Verifiera med axe/Lighthouse + tabbgenomgång.
- **Hemligheter** via Dokploy, aldrig i repo. TLS via Traefik. Postgres ej publik.
- Access-kod som enkel server-side-koll i v1; byt mot riktig IdP senare.

---

## 13. Faser (så här körs bygget i Claude Code)  ✅ *(alla genomförda — står kvar som historik)*

- **Fas 0 — Skelett:** monorepo, `CLAUDE.md`, `docker-compose.yml`, hello-world frontend+backend+db som pratar ihop lokalt (`docker compose up`).
- **Fas 1 — Backend & data:** SQLAlchemy-modeller, Alembic-migration, seed, läs-API (`/api/dialogues/{id}`, `/api/kpi-areas`, `/api/health`). OpenAPI verifierad.
- **Fas 2 — Frontend mot designsystemet:** bygg om dashboarden med `@sk-web-gui`-komponenter och tokens, konsumera API:t, nå paritet med dagens prototyp (alla sex skärmelement).
- **Fas 3 — Skrivflöden:** spara överenskommelser, markera genomgången, progress persisteras.
- **Fas 4 — Login & polish:** access-kod-stub, tillgänglighetspass, felhantering/tomma tillstånd i interface-röst.
- **Fas 5 — Deploy:** härda Dockerfiles, Compose för Dokploy, env/secrets, domän + TLS, rök-test på `bbb.sundsvall.dev`.

Varje fas avslutas med commit + kort verifiering. Bygg en fas i taget.

---

## 14. Att driva detta i Claude Code

- Installera Claude Code (npm-paketet `@anthropic-ai/claude-code`) och kör `claude` i repo-roten. Aktuella install-/versionskrav: se `https://docs.claude.com/en/docs/claude-code/overview`.
- Lägg en **`CLAUDE.md`** i roten med: (1) länk till designsystemet `https://ui.sundsvall.dev/llms-full.txt` och regeln "använd endast tokens/komponenter därifrån, hårdkoda aldrig hex", (2) språk = svenska, knapptext = verb i imperativ, (3) stacken (FastAPI/Postgres/Next.js + @sk-web-gui), (4) fasplanen ovan, (5) regeln om endast öppen/publik information.
- Arbeta fas för fas: be Claude Code scaffolda Fas 0, kör `docker compose up` och bekräfta, gå sedan vidare. Låt den skriva och köra tester samt committa per fas.
- Peka uttryckligen Claude Code mot `ui.sundsvall.dev` när frontend byggs, så att komponentval och tokens blir korrekta mot designsystemet.

---

## 15. Öppna designbeslut att ta tidigt

1. KPI-statusskala mot SK-tokens (trafikljus vs. semantiska färger) — se 6.
2. En domän med `/api`-proxy (rekommenderat) eller separat `api.`-subdomän.
3. Hur perioder modelleras (fält vs. egen tabell) när historik/trender ska bli riktiga.
4. Var dummydata slutar och riktiga källsystem börjar (vilka KPI:er kommer först).

---

## 16. Dialog-only-nyckeltal: manuell status per förvaltning  ✅ *(byggt)*

**Verksamhet**, **Digital transformation** och **Kommunikativt ledarskap** visas som nyckeltal
**utan mätdata** — de följs upp genom dialog i stället för importerade siffror. De skiljer sig från
HME/Ekonomi/Sjukfrånvaro (som hämtas): inget diagram, ingen mätarbar.

**Levererat:**

- **Kort utan mätvärde** (`QuestionPanel`): visar ett par frågeställningar att ha dialog kring (§17)
  och en **manuellt satt status** för området.
- **Manuell status per förvaltning:** grön/gul/röd (visas med legendtexterna *Över mål / Bevaka /
  Åtgärd krävs*) + en **kommentar** om varför. Sparas i tabellen `area_status` som **append-only
  historik** — varje sparning blir en ny post; senaste gäller och highlightas, äldre visas som
  historik under. Kortets färg följer senaste posten.
- **Endpoint:** `POST /api/dialogues/{id}/areas/{area_id}/status` (del av dialogflödet, gatas av
  access-koden). Seeden håller dessa områden fria från mätvärden (`DIALOG_ONLY_KEYS`).

**Avvikelse från ursprungsskissen:** den tidigare idén med två separata bedömningar
(**Kommunfullmäktigemål** + **Grunduppdrag**) med var sin status byggdes **inte** — vi landade i
**en status per område** (enklare, samma modell för alla tre). Vill vi återinföra KF-mål/Grunduppdrag
är det ett tillägg ovanpå `area_status`.

---

## 17. Dialogfrågor på nyckeltal utan data  ✅ *(byggt)*

De tre dialog-only-nyckeltalen (§16) visar **frågeställningar att ha dialog kring** i stället för en
mätare — samtalet är värdet. Återanvänder KPI-areans `questions` (Question-modellen, seedad per area).

**Levererat:**

- `verksamhet`, `digital` och `kommunikativt` är synliga (ur `DOLDA_OMRADEN`); `kommunikativt` lades
  till som KPI-area i seed. `GET /api/dialogues/{id}` returnerar alla områden med `measurement = null`
  för dessa.
- **Kommunikativt ledarskap** har de fyra medarbetarenkätfrågorna inlagda. Seeden **reconcilerar**
  frågor mot seed-listan (uppdaterar/lägger till/tar bort), så innehåll kan uppdateras via seed.

**Kvar att göra (innehåll, utanför koden):** slutgiltiga frågeställningar för **Digital
transformation** (med IT-direktör) och **Verksamhet** — byts in via seed när de är klara. Frågorna
finns delvis framtagna till medarbetarenkäten.

---

## 18. Organisation som master — frikoppla från HME-importen  ✅ *(byggt)*

Förvaltningslistan är nu **master**, med **masterdata-koden** (`organisation.kod` = `orgId`) som den
centrala nyckeln som nyckeltalen knyts till. HME/Ekonomi/Sjukfrånvaro **kopplar** bara mot befintliga
förvaltningar — de skapar dem inte.

**Levererat:**

- **Master-källa:** `backend/app/seed_data/organisationer.json` (bundlad i imagen). Seeden skapar/
  uppdaterar de 9 förvaltningarna (kod/namn/slug) + en dialog per förvaltning + fiktiva bootstrap-
  mätvärden (bara om inget mätvärde finns; riktig import skriver över). Körs vid varje start.
- **"Koppla, inte skapa":** HME-importen skapar inte längre org/dialog/fiktiva mätvärden. Den matchar
  på **koden (orgId)** när filen har den (nya `HME_totalindex_medorg.json`), annars på slug.
  Ekonomi/sjukfrånvaro kopplade redan på koden (Qlik-CSV:ns `Enhet`).
- **Bortstädning:** förvaltningar utanför mastern (utan kod) tas bort med sina dialoger/mätvärden —
  dvs **Räddningstjänsten** och **Stadsbacken** (inte aktuella att följa upp).

**Kvar/valfritt:** org-id (PK) är fortfarande en surrogatnyckel; `kod` är den nyckel data kopplas på.
Vill man göra `kod` till den publika identifieraren i URL:er/API:er är det ett separat steg. Nya
HME-filen kan importeras till drift när som helst (kopplar då på orgId) — prod har redan HME-data.
