# AGENTS.md — projektminne för Big Boss Board (bbb)

Internt arbetsnamn: **Big Boss Board (bbb)**. Visas **aldrig** i gränssnittet.
Publik domän: `bbb.sundsvall.dev`. Produkten är ett **dialogstöd för chefsuppföljning**:
en chef går igenom nyckeltal område för område med en underställd chef och fångar
överenskommelser direkt i samtalet.

Aktuell arkitektur finns i [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Den ursprungliga byggplanen finns i [`docs/BYGGPLAN.md`](docs/BYGGPLAN.md).
Designreferens/prototyp: [`docs/uppfoljningsdialog.html`](docs/uppfoljningsdialog.html).

## Visuellt språk (eget lättviktslager)

Frontend hämtar sitt **visuella grundintryck** från Sundsvalls kommuns profil men
implementerar det i ett **eget, litet token-lager** — **inte** hela designsystemet.
`@sk-web-gui` används **inte längre** (beslut: avkoppla beroendet, behåll utseendet).

- **Tokens bor i `frontend/app/globals.css`:** Tailwind 4 `@theme` äger färger, spacing,
  radie och typografi tillsammans med CSS-bas och komponentklasser. `tailwind.config.js`
  är borttagen. Använd token-utilities i markup; `--spacing: 1px` behåller px-skalan.
- **Hex hör hemma i token-filerna**, inte spridda i markup. Centralt: globals + de tre
  graf-filerna (`components/charts/*` har seriefärger som hex). Skriv aldrig nya hex i sid-markup —
  använd en token-utility, lägg värdet i globals.css om det saknas.
- **Palett (ur kommunens profil):** vattjom-blå `#0055B8` (`vattjom-surface-primary`), blå text/ikon
  `#00427D` (`vattjom-text-primary`), ljus blå ton `#E6EEF7` (`vattjom-background-100`), ink `#1F1F25`
  (`dark-primary`), dämpad `#51515C` (`dark-secondary`), sidyta `#F0F0F0` (`background-200`), kort
  `#FFFFFF` (`background-content`), hårlinje `#E5E5E5` (`hairline`), avdelare `#B7B7BA` (`divider`),
  fokusring `#0C8CED` (`outline-ring`).
- **Funktionella status/trafikljus:** `status-good #1E8A4E`, `status-warn #EAB308` (medvetet rent
  gult — skilj "Bevaka" från rött), `status-alert #D32F2F`. Semantiska ytor: `success/warning/error`
  med `-text` och `-background-*`. Mappning i `components/status.ts`.
- **Spacing/radie = px-lik skala (`token-N` = N px):** `p-16`=16px, `gap-12`=12px, `rounded-12`=12px,
  `h-48`=48px. Spacing beräknas med `--spacing: 1px`; radier definieras uttryckligen i `@theme`. Roten är vanlig
  **16px** (inte SK:s 62.5%), så **typografi anges i absoluta px** — text-tokens (`text-small`,
  `text-base`, `text-h1` …) definieras i `globals.css`, egna storlekar (t.ex. `.eyebrow`)
  i `px` i `globals.css`.
- **UI-primitiver:** lokala i `frontend/components/ui/` (`Button`, `Input`, `Textarea`,
  `FormControl`, `FormLabel`, `Logo`) via barrel `@/components/ui`. Stödjer de props appen använder
  (`Button` variant `primary`/`ghost`, `loading`, `leftIcon`).
- **Logotyp:** appens header (`components/BrandLockup`, använd i BrandBar/StatusHeader/Dashboard)
  visar kommunens **officiella logotyp** (`frontend/public/brand/sundsvalls-kommun-logotyp.svg`,
  svart variant) + avdelare + produktnamnet **"Dialogstöd"** i Raleway — samma header-stil som
  systerappen Verktyg. Den egna wordmarken `<Logo>` (emblem + "Sundsvalls kommun" i vattjom-blå)
  finns kvar och används på login-skärmen.
- **Typsnitt:** brödtext/fält/knappar = **Arial**, rubriker = **Raleway** (`font-header`), etiketter =
  **Geist Mono** (`font-mono`). Raleway + Geist Mono laddas i `app/layout.tsx` (Google Fonts).

## Språk och ton

- Allt UI-innehåll är på **svenska**.
- Knapptext = **verb i imperativ** ("Spara", "Markera som genomgången", "Visa område").
- Tomma tillstånd och fel skrivs i samma sakliga interface-röst som resten av appen.

## Stack

- **Frontend:** Next.js 16 (App Router) + React 19 + TypeScript, Tailwind 4 + eget token-lager
  (se "Visuellt språk"). Standalone-output.
  Proxar `/api/*` → backend via `next.config` rewrites (en domän, inga CORS-bekymmer).
- **Backend:** FastAPI + SQLAlchemy 2.0 + Pydantic v2 + Alembic. Uvicorn (Gunicorn i prod).
  Alla endpoints under prefix `/api`. OpenAPI på `/api/docs`.
- **Databas:** PostgreSQL 16. Namngiven volym, ej publik. Migrationer vid start; explicit seed endast för en tom appdatabas.
- **Infra:** kommunen använder OpenShift-anpassade containrar och SAML/Redis.
  Compose/Dokploy finns kvar som separat körväg. Endast `frontend` exponeras publikt.

## Dataregel (viktig)

- Appen används **endast för öppen och publik information**. Inga personuppgifter eller
  känsliga uppgifter — gäller även dummydata. Visas som Alert i UI.
- Dummydata för KPI:er utan källa är **fiktiv**. HME använder **riktiga anonymiserade
  aggregat** per förvaltning ur den officiella rapporten (flerårig serie → historik + trend).
- **HME-data (rapport/rådata) versionshanteras aldrig** (`indata/` och `backend/app/data/*.json`
  är gitignorerade). Import sker uttryckligen via API eller `scripts/import_hme.py`,
  genom token-skyddade `/api/import/hme-rapport` eller `/api/import/hme` (`IMPORT_TOKEN`).
  Normalisering och upsert ägs av `app/services/hme_import.py`. Ingen filimport sker vid start.
  `scripts/build_hme_aggregate.py` finns kvar som rådata-analys: delindex + chef/medarbetare
  med n<5-suppression — ej primär källa.

## Initiering och uppstart

`backend/entrypoint.sh` kör Alembic och därefter Gunicorn. `python -m app.seed` är
ett separat engångskommando för en helt tom appdatabas, före första användning.
Kontroll av alla apptabeller och skapande sker i en transaktion; fel rullar tillbaka
hela initieringen. Seed skapar inga mätvärden och importerar inga rapportfiler.
Befintligt innehåll ägs av databasen. Ändringar i referensdata i drift behöver en
separat granskad datamigrering; malländringar får bara effekt i nya installationer.

## Inkorg / intake (status-sidan)

Projektdeltagare kan lämna in **fri text** (fråga/synpunkt/aktivitet) via formuläret
`/status/skicka-in` (CTA-länk från `/status`). Sidan gatas av access-koden (vanlig
middleware). Inlämningar hamnar i en **egen kö** (`submission`-tabellen) och rör
**aldrig** de kurerade kolumnerna på status-sidan — arbetsgruppen läser, knådar och
publicerar manuellt.

- **Publik create:** `POST /api/submissions` (ingen token; gatad av middleware via proxyn).
  Server action `app/status/skicka-in/actions.ts` → backend. Honeypot-fält mot bottar,
  maxlängd 4000 tecken. Endast öppen/publik info (dataregeln gäller — inga personuppgifter).
- **Triage (admin-behörighet, se nedan):** `GET /api/admin/submissions[?status=ny]`
  och `PATCH /api/admin/submissions/{id}` (status: `ny`/`granskad`/`publicerad`/`arkiverad`
  + intern `notering`). CLI: `IMPORT_TOKEN=… python3 scripts/read_inbox.py --url <bas-url>`.
- Logik i `app/services/submissions.py`; modell i `models.py`; migration
  `6f4a1b2c8d05_submission_inkorg.py`.

## Status-sidan: datadriven (Fas B)

Status-sidans kort bor i **databasen** (inte längre hårdkodade — `data.ts` är borttagen).
Två tabeller: `status_fraga` (öppna/besvarade + övergripande frågor; öppen vs besvarad
**härleds** av om `svar` finns, `kategori` skiljer vanlig/övergripande) och `statusrapport`.
Modeller i `models.py`, migration `7a2b3c4d5e06_status_content.py`, logik i
`app/services/status_content.py`.

- **Publikt läs:** `GET /api/status-cards` → `{fragor, rapporter}` (endast `publicerad=True`).
  `frontend/app/status/page.tsx` (server-komponent, `force-dynamic`) hämtar via
  `lib/api.ts listStatusContent()`.
- **Admin-skyddat skriv** (samma behörighet som importen, i `routers/admin.py`):
  `POST/PATCH/DELETE /api/admin/status-cards` och `POST/PATCH /api/admin/status-rapporter`,
  samt `GET /api/admin/status-cards` (inkl. opublicerade utkast). Server sätter `nummer`
  (publikt "#N", max+1, återanvänds aldrig). Anges `submission_id` vid skapande markeras
  den inkorgsposten `publicerad`. Sätt `svar` → kortet flyttas till besvarade.
- **Inkorg i GUI:t:** status-sidan visar en **admin-only** inkorg-sektion (via `isAdmin()`
  + server-only `lib/admin-api.ts listSubmissionsAdmin()`). Vanlig access-kod ser den inte;
  råa inlämningar publiceras aldrig automatiskt.
- **Publiceringsväg:** läs inkorgen via API lokalt → `POST /api/admin/status-cards` med
  `submission_id` → kortet hamnar i rätt kolumn och submissionen markeras publicerad.
- **Bootstrap:** startinnehållet (de tidigare `data.ts`-korten) seedas **en gång** i
  `seed.py` vid explicit initiering av en helt tom appdatabas. Finns någon appdata ändras
  ingenting, även om statustabellerna är tomma. Senare redigeringar och borttagningar bevaras.
- **Ännu ej byggt:** inget webb-GUI för triage (sker via API/Codex); statuskort
  saknar ändringshistorik (`uppdaterad_at` räcker).

## Produktfunktioner och importer (september 2026)

Kommunens SAML/ADFS, sessioner, behörigheter och OpenShift-anpassningar är bevarade.
Importkontrakt: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#datainflöden).
Införande och återställning: [`docs/DEPLOY.md`](docs/DEPLOY.md#införa-nyckeltalsuppdateringen).

- Ekonomi visar **prognos minus helårsbudget**, beräknat av `services/ekonomi.py` vid
  import och läsning (`MeasurementOut`). Saknad budget/prognos ger null i status/värde.
  Månadsdiagrammet är `EkonomiDiffChart`; det gamla nettokostnadsdiagrammet är borttaget.
- `POST /api/import/ekonomi-filer` tar namngivna CSV/TXT-uttag och väljer senaste ordinarie
  uttag dag 1–9 månaden efter rapportperioden. API och CLI använder samma backendregel.
  Fil- och enkelperiodimport bevarar historik och huvudvärdet vid äldre uttag. Explicit serieimport
  ersätter serien. Dokumenterad aprilrättning ägs av `services/ekonomi.py`.
- Sjukfrånvaro använder **R12**, kvartalstrend och uppskattad årskostnad. Backend avvisar
  gammal/okänd personalexport. Äldre lagrade aggregat visas som "Inväntar R12".
  `/api/import/sjukfranvaro-filer` normaliserar flera filer och bevarar historik.
- HME har totalindex + motivation, ledarskap och styrning. `/api/import/hme-rapport` tar
  totalindex och valfri separat delindexrapport; API och CLI delar normalisering.
- Organisationsmastern skiljer förvaltningar från Stadsbacken/MRF. `dialogbaserad` är en
  lista med KPI-nycklar som ska följas upp med organisationsspecifika frågor utan mätdata.
- Frågor har valfri `rubrik` och `bygger_pa`; statusrapporter har valfri `aterstaende`.
- Rådata versionshanteras aldrig. Undvik statiska rapportkopior och separata metadatafiler
  som dubblerar appens datakontrakt.

## Inloggning (AUTH_MODE: access_code | saml)

Två lägen, valt med `AUTH_MODE` (frontend-middleware och backend läser samma variabel):

- **access_code** (default): `ACCESS_CODE`/`ADMIN_ACCESSCODE` används bara vid login.
  `lib/access-session.ts` äger signerad roll + 8 timmars giltighet i `bbb_access`;
  kräver oberoende `SESSION_SECRET` (minst 32 tecken). Kod/nyckelrotation återkallar
  sessionerna. Middleware och `isAdmin()` använder samma verifiering. Begränsning av
  inloggningsförsök i `lib/login-attempts.ts` gäller per frontend-process; ingressen
  måste sätta betrodd sista `X-Forwarded-For`. SAML-kakan `bbb_session` är separat.
- **saml**: backend äger SAML mot kommunens IdP (draken-mönstret, portat till FastAPI +
  **python3-saml** — inte pysaml2, som saknar knappar för test-IdP:ns kvirkar; se
  `docs/SAML_SSO_PLAN.md`). Kod i `backend/app/auth/`: `router.py` (`/api/auth/saml/
  {login,callback,metadata,logout,logout/callback}` + `/api/me`), `sessions.py`
  (session-id i HMAC-signerad cookie `bbb_session`; data i Redis — utan `REDIS_HOST`
  minnesstore, endast lokalt med `WEB_CONCURRENCY=1`; satt-men-onåbar Redis = vägrad
  start), `claims.py` (ADFS/Onegate-dubbelmappning, grupper → roll `admin`/`user`),
	  `redirects.py` (RelayState/origin-validering), `saml.py` (`SAML_STRICT=true` i drift,
	  signerad assertion krävs som standard; toleransläge används endast mot test-IdP; IdP beskrivs av
  `SAML_ENTRY_SSO`/`SAML_IDP_ENTITY_ID`/`SAML_IDP_PUBLIC_CERT`). Utloggning: avatar-menyn
  i headern (`components/UserMenu` + server-wrapper `UserBadge`, initial-avatar i
  `ui/Avatar` — shadcn-mönstret i eget token-lager, INTE shadcn/Radix som beroende)
  → `/api/auth/saml/logout` som rensar sessionen lokalt och, om `SAML_IDP_LOGOUT_URL`
  är satt, även IdP-sessionen (test-IdP:ns `/logout?RelayState=` — den kan inte parsa
  riktiga SLO-requests). Frontend-middleware validerar
  sessionen mot `/api/me`; `isAdmin()` läser rollen därifrån; login-sidan visar
  SAML-knapp och `?failMessage=<KOD>`-fel. Env-namnen följer draken (se `.env.example`)
  så OpenShift-secrets kan återanvändas. Tester i `backend/tests/`. Plan: `docs/SAML_SSO_PLAN.md`.
  WSO2-tokentjänsten (OAuth2 client credentials, Redis-cachad) ligger vilande i
  `app/services/gateway_token.py`.

## Admin-behörighet: `/api/import/*` och `/api/admin/*`

Båda routrarna gatas av `backend/app/auth/admin_access.py` (`AdminAccessRoute`, körs
**före** kroppen läses) och accepterar **en av två** vägar:

- **Import-token** — `Authorization: Bearer <IMPORT_TOKEN>` för skript/automation
  (`scripts/*.py`, curl, CI). Finns headern avgör den ensam. Tom `IMPORT_TOKEN` ger 503
  på tokenvägen. Skilt från användarauth i båda lägena.
- **Inloggad admin-session** — kakan `bbb_session` med rollen `admin`
  (`SAML_ADMIN_GROUPS`). Bara i saml-läget, där backend äger sessionen. `user` får 403.
  Gör att `/api/docs` (importgränssnittet — ingen importvy finns) och inkorgen fungerar
  för en inloggad admin **utan** att frontend håller tokenen. CSRF: SameSite=Lax + JSON-kroppar,
  och ändrande anrop med `Sec-Fetch-Site: cross-site` avvisas.

Frontend väljer väg i `lib/admin-api.ts adminAuthHeaders()`: saml → vidarebefordra
sessionskakan; access_code → `IMPORT_TOKEN` (backend har ingen session där). Middleware
släpper igenom `/api/import`/`/api/admin` orörda så att backend avgör.

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

- Hemligheter aldrig i repo — de ägs av driftmiljön. Se `.env.example` för nycklar.
- Interna tjänster (backend, db) får inga publika portar.
