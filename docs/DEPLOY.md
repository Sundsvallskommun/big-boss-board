# Deploy — `bbb.sundsvall.dev` via Dokploy

Denna checklista beskriver Compose/Dokploy-körvägen. Kommunens OpenShift-flöde
beskrivs i [OPENSHIFT_PROD_PLAN.md](OPENSHIFT_PROD_PLAN.md).
Produktuppdateringens gemensamma införandekrav finns [nedan](#införa-nyckeltalsuppdateringen).

Operativ checklista för att driftsätta stacken. Teknisk översikt finns i
[`ARCHITECTURE.md`](ARCHITECTURE.md); bakgrund/motivering i [`BYGGPLAN.md`](BYGGPLAN.md) §9–§12.

## Arkitektur i drift

- Endast **frontend** exponeras publikt. Dokploy/Traefik sätter domän + TLS och
  routar till frontend-containern på port `3000`.
- **backend** och **db** ligger på det interna compose-nätverket utan host-portar.
- Frontend proxar `/api/*` → backend (`BACKEND_INTERNAL_URL`), så allt ligger på en domän.
- `docker-compose.yml` är produktionskonfigurationen (inga publicerade portar).
  `docker-compose.override.yml` är **endast lokal** och används inte av Dokploy.

## Förutsättningar

- DNS: `bbb.sundsvall.dev` → Dokploy-värdens IP (krävs innan TLS kan utfärdas).
- Repot nåbart från Dokploy (GitHub eller intern Git).

## Steg

1. **Skapa Compose-applikation** i Dokploy och peka på repot + `docker-compose.yml`.
2. **Domän:** sätt `bbb.sundsvall.dev` mot tjänsten **frontend**, port `3000`.
   Dokploy injicerar Traefik-labels och ordnar Let's Encrypt-TLS automatiskt.
3. **Env/secrets** i Dokploy (committa aldrig — se [`.env.example`](../.env.example)):
   - `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
   - `DATABASE_URL=postgresql+asyncpg://<user>:<password>@db:5432/<db>`
   - `ACCESS_CODE` — åtkomstkod för UI:t. Tom kod släpper inte igenom trafik om inte
     `ALLOW_OPEN_ACCESS=true` sätts uttryckligen; sätt aldrig den flaggan i drift.
   - `ADMIN_ACCESSCODE` — separat kod som visar import-GUI:t på `/admin/import`. Vanlig
     `ACCESS_CODE` ser inte GUI:t. Sätts på frontend.
   - `SESSION_SECRET` — oberoende hemlighet med minst 32 tecken (skapa med
     `openssl rand -hex 32`). Krävs på frontend när kodinloggning används, även lokalt.
     Sätt samma värde på alla repliker. Kommunens SAML-läge använder fortsatt `SECRET_KEY`
     i backend och behöver inte denna nya variabel.
   - `BACKEND_INTERNAL_URL=http://backend:8000` (default räcker normalt).
   - `IMPORT_TOKEN` — hemlig nyckel för HME-importen (se steg 5). Tom = endpoint avstängd.
     Sätts på **både** backend (endpointen) och frontend (import-GUI:ts server-action).
   - `HME_DATA_DIR` — valfri värdkatalog med `HME_totalindex.json` för bootstrap vid uppstart.
4. **Persistent volym:** säkerställ att `db-data` är en bestående volym.
5. **HME-data (utanför git).** HME-siffror versionshanteras inte. Två vägar:
   - **Admin-GUI (enklast):** logga in med `ADMIN_ACCESSCODE`, öppna `/admin/import` (länk
     "Importera HME" syns på startsidan endast för admin) och ladda upp `HME_totalindex.json`.
     Kräver `IMPORT_TOKEN` på frontend.
   - **Import-endpoint/CLI (för automation):** sätt `IMPORT_TOKEN` och kör efter deploy
     `IMPORT_TOKEN=... python3 scripts/import_hme.py --url https://bbb.sundsvall.dev` med den
     officiella rapporten (`HME_totalindex.json`). Endpointen **upsertar** — kör om vid ny mätning
     (t.ex. när 2027 tillkommer) utan redeploy eller DB-nollning.
   - **Fil vid uppstart (bootstrap):** lägg `HME_totalindex.json` i en värdkatalog och peka
     `HME_DATA_DIR` dit; seed läser den vid start. Saknas både fil och import startar appen ändå
     med enbart referensdata (väljaren visar tomt läge tills HME importerats).
   - **Ekonomi & sjukfrånvaro** matas in på samma sätt (token-skyddade endpoints, upsert) med
     `scripts/import_ekonomi_serie.py` resp. `scripts/import_sjukfranvaro.py`. Se
     [`ARCHITECTURE.md`](ARCHITECTURE.md#datainflöden).
6. **Deploya.** Vid start kör backend automatiskt `alembic upgrade head` → seed
   (idempotent) → Gunicorn. Kör därefter importen (steg 5) om du inte använt fil-bootstrap.

## Verifiering efter deploy

- `https://bbb.sundsvall.dev` laddar dashboarden med seedad data.
- `https://bbb.sundsvall.dev/api/health` svarar `{"status":"ok",...,"db":"ok"}` via proxyn.
- Om `ACCESS_CODE` är satt: oinloggad träffar `/login`; rätt kod ger åtkomst.
- Backend och db har inga publika portar (endast frontend nås utifrån).

## Drift

- **Migrationer/seed** körs vid varje deploy via `backend/entrypoint.sh` (idempotent).
- **Loggar/health:** alla tjänster har healthchecks och `restart: unless-stopped`.
- **Rulla tillbaka:** redeploya tidigare commit i Dokploy. Datat ligger kvar i volymen.

## Dataregel

Tjänsten används **endast för öppen och publik information**. Fiktiv dummydata för de KPI:er
som saknar källa, och riktiga **anonymiserade aggregat** för HME (per förvaltning, med
segment-suppression vid n<5). Inga personuppgifter eller känsliga uppgifter — gäller även
testdata. Råfiler och HME-aggregat versionshanteras aldrig; aggregatet levereras via
`HME_DATA_DIR` (se steg 5).


## Införa nyckeltalsuppdateringen

Gäller både kommunens OpenShift-flöde och Compose, utan byte av SAML, sessioner eller
runtime-konfiguration. Next 16 använder fortsatt Webpack och befintlig middleware.
Tailwind 4 behöver Safari 16.4+, Chrome 111+ eller Firefox 128+; stäm av klientmiljön.

1. Verifiera produktionsbygge och riktig SAML-inloggning/utloggning samt behörigheter
   i testmiljön. Granska nya diagram och dialogflöden med tangentbord och smal skärm.
2. Ta databassnapshot och prova migrationen på en PostgreSQL-kopia. Sex migrationer
   från `a0d5e6f7b109` till `a6d1e2f3a746` lägger till frågornas ursprung, rubrik och
   organisation, rapporters återstående aktiviteter och organisationsgruppering samt
   gör mätvärde/status nullable. SQL-generering ensam verifierar inte migreringen.
3. Kör migrationer och seed via den befintliga deployvägen. Seed uppdaterar frågor
   och organisationsmaster, men skriver inte över befintliga statusrapporter.
4. Importera aktuellt R12-underlag och HME med delindex via webb eller CLI.
   Kontrollera datadefinition och kostnadsschablon med respektive dataägare. Äldre
   sjukfrånvarouttag används inte som R12. Import av ekonomimånader bevarar historiken
   via webb/CLI; `/ekonomi-serie` ersätter uttryckligen serien.
5. Kontrollera importresultatets överhoppade enheter, senaste period, diagram och
   prognosstatus. Verifiera att manuella bedömningar och aktiviteter finns kvar.

**Återställning:** kodversion och databassnapshot behöver återställas tillsammans
om importer har körts. En schema-downgrade återställer inte tidigare mätmetod eller
seedade frågetexter. Nullable-migrationens downgrade avvisas när nullvärden finns;
förvandla inte saknat underlag till ett påhittat värde för att tvinga igenom den.

Genomförd validering och kvarstående granskningspunkter dokumenteras i aktuell PR,
inte i en separat arbetslogg i repot.


## Införa säkerhets- och HME-uppdateringen

Ändringen kräver ingen datamigrering. Kodinloggning kräver `SESSION_SECRET` på frontend
före utrullning; äldre kakor med själva koden avvisas och användaren loggar in igen.
Nyckel- eller kodrotation återkallar utfärdade kodsessioner. SAML:s inställningar och
Redis-sessioner är oförändrade. Använd inte samma cookie eller nyckel för de två lägena.

Verifiera i testmiljön att SAML-login, `/api/me`, adminbehörighet och utloggning fungerar
genom kommunens proxy. Rewrites och runtime-ersättning av backend-URL behålls. Ingressen
ska sätta betrodd sista `X-Forwarded-For`; kodinloggningens räknare är lokala per process
och behöver kompletteras i ingressen vid flera frontend-repliker. Kontrollera även
HME-kurvans gränser (mål och mål minus fem) i webbläsaren samt bygg båda containrarna.

Backendens låsfil uppdateras för Python 3.12; SAML-/XML- och Redis-beroenden behålls.
Node 22 och OpenShift-anpassningen (grupp 0, PORT, kontrollsocket, probes och runtime-URL)
behålls. Gunicorn får uttryckliga tidsgränser och längre keep-alive. Pakethanterare tas
bort ur runtime-imagerna. CSP tillåter SAML:s externa omdirigeringar.

**Återställning:** återgå till föregående kod/image; ingen databasåterställning krävs för
denna ändring. Kodsessioner kan kräva ny inloggning även efter återställning.
