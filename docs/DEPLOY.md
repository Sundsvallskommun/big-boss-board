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
   - `ADMIN_ACCESSCODE` — separat kod som visar inkorgen på `/status`. Vanlig
     `ACCESS_CODE` ser inte inkorgen. Sätts på frontend.
   - `SESSION_SECRET` — oberoende hemlighet med minst 32 tecken (skapa med
     `openssl rand -hex 32`). Krävs på frontend när kodinloggning används, även lokalt.
     Sätt samma värde på alla repliker. Kommunens SAML-läge använder fortsatt `SECRET_KEY`
     i backend och behöver inte denna nya variabel.
   - `BACKEND_INTERNAL_URL=http://backend:8000` (default räcker normalt).
   - `IMPORT_TOKEN` — maskinnyckel för importen (se steg 5). Tom = tokenvägen avstängd.
     Sätts på backend. Frontend behöver den **bara i access_code-läget** (admin-inkorgens
     serverhämtning) — i saml-läget vidarebefordras admin-sessionen och backend avgör.
4. **Persistent volym:** säkerställ att `db-data` är en bestående volym.
5. **Mätdata (utanför git).** Data importeras uttryckligen via API eller CLI:
   - **Import-endpoint/CLI (för automation):** sätt `IMPORT_TOKEN` och kör efter deploy
     `IMPORT_TOKEN=... python3 scripts/import_hme.py --url https://bbb.sundsvall.dev` med den
     officiella rapporten (`HME_totalindex.json`). Endpointen **upsertar** — kör om vid ny mätning
     (t.ex. när 2027 tillkommer) utan redeploy eller DB-nollning.
   - **Ekonomi & sjukfrånvaro** matas in på samma sätt (token-skyddade endpoints, upsert) med
     `scripts/import_ekonomi_serie.py` resp. `scripts/import_sjukfranvaro.py`. Se
     [`ARCHITECTURE.md`](ARCHITECTURE.md#datainflöden).
6. **Deploya.** Vid start kör backend automatiskt `alembic upgrade head` → Gunicorn.
   Endast för en **ny, tom databas**, kör därefter `docker compose exec backend python -m app.seed`
   en gång före första användning. Befintliga installationer behöver ingen initiering.
   Importera sedan mätdata via steg 5. Se även [säker uppstart](#införa-säker-uppstart).

## Verifiering efter deploy

- `https://bbb.sundsvall.dev` laddar dashboarden med befintlig eller uttryckligen initierad data.
- `https://bbb.sundsvall.dev/api/health` svarar `{"status":"ok",...,"db":"ok"}` via proxyn.
- Om `ACCESS_CODE` är satt: oinloggad träffar `/login`; rätt kod ger åtkomst.
- Backend och db har inga publika portar (endast frontend nås utifrån).

## Drift

- **Migrationer** körs vid varje backend-start via `backend/entrypoint.sh`; redan körda revisioner hoppas över. Seed körs aldrig automatiskt.
- **Loggar/health:** alla tjänster har healthchecks och `restart: unless-stopped`.
- **Rulla tillbaka:** välj en schema-kompatibel image som behåller säker uppstart (se nedan). Datat ligger kvar i volymen, men äldre seed-kod kan ändra det vid start.

## Dataregel

Tjänsten används **endast för öppen och publik information**. Ny initiering skapar inga
mätvärden; HME importeras som riktiga **anonymiserade aggregat**. Inga personuppgifter
eller känsliga uppgifter — gäller även testdata. Råfiler och HME-aggregat versionshanteras
aldrig. Import sker uttryckligen via API eller CLI (se steg 5).


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
3. Kör migrationer via den befintliga deployvägen. Den ursprungliga utrullningen
   uppdaterade även frågor och organisationsmaster via seed. Efter ändringen till säker
   uppstart måste sådana innehållsändringar göras genom en separat granskad datamigrering
   på en befintlig databas. Seed kan bara initiera en helt tom installation.
4. Importera aktuellt R12-underlag och HME med delindex via API eller CLI.
   Kontrollera datadefinition och kostnadsschablon med respektive dataägare. Äldre
   sjukfrånvarouttag används inte som R12. Import av ekonomimånader bevarar historiken
   via API/CLI; `/ekonomi-serie` ersätter uttryckligen serien.
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

**Återställning:** återgå till en schema-kompatibel kod/image som behåller säker uppstart;
ingen databasåterställning krävs för denna ändring. Kodsessioner kan kräva ny inloggning även efter återställning.


## Införa säker uppstart

Backend kör migrationer följt av Gunicorn. Ingen seed, rensning eller filimport körs vid
omstart eller deploy. Ändringen kräver **ingen ny databasrevision** och ingen manuell
initiering i befintlig produktion. Befintliga mätvärden, aktiviteter, manuella bedömningar,
frågor och organisationer lämnas orörda; även tidigare dummydata ligger kvar tills en
separat, granskad åtgärd eller uttrycklig import ändrar den.

1. Bygg och publicera backend-imagen, uppdatera dess referens i GitOps-repot och synka
   Argo enligt den vanliga deployvägen. Borttagningen av importvyn kräver även den nya
   frontend-imagen. Kontrollera att båda imagerna finns före synk.
2. Kontrollera rätt image och friska pods. Startloggen ska visa migrationer följt av
   Gunicorn, utan ett seed-steg. Kontrollera befintliga dialoger och importerade värden.
3. Fortsätt importera mätdata via API eller CLI. `HME_DATA_DIR` och gamla monterade
   rapportfiler används inte längre. Befintliga installationer ska inte initieras på nytt.

Endast en **ny installation med tom appdatabas** behöver `python -m app.seed`, efter
migrationerna och före första användning. Kör en enda initiering utan samtidig trafik,
i backend-containern med dess befintliga `DATABASE_URL`; databasen får ligga på en
annan server. I OpenShift kan en behörig operatör köra:

```sh
oc exec -n web-big-boss-board deployment/big-boss-board-backend -c backend -- python -m app.seed
```

Kommandot kräver rättighet till `pods/exec` och ska inte köras inne i Postgres-containern.
Finns någon appdata avslutas initieringen utan ändringar. Vid fel rullas hela initieringen
tillbaka; rätta orsaken och kör igen. En delvis fylld databas måste utredas separat,
inte tömmas för att få seed att köra.

**Återställning:** ingen schemaändring behöver återställas. En äldre image kan däremot
återinföra automatisk seed och ändra data direkt vid start. Behåll den säkra uppstarten
vid kodåtergång eller gör en korrigerande release. Återställ inte en gammal datakopia
rutinmässigt, eftersom det skulle kasta bort senare verksamhetsdata.


## Schemalagd rapportimport från SMB

Två separata CronJobs i namespace `web-big-boss-board` kör backendens image med
`python -m app.smb_import --kind ekonomi` respektive `--kind sjukfranvaro`.
Koden finns i apprepot; schema, sökvägar och secret-referenser ägs av GitLabs
`webapp-frontend/argocd/big-boss-board`, under `envs/prod/bbb/`. Tekton bygger samma
backend-image och uppdaterar Kustomize-bildnamnet `backend` för både API och jobb.
Jobbens `command` ersätter imagen­s ENTRYPOINT: ingen webbserver, seed eller
migration startas av importjobbet. Jobbet behöver inte databasinloggning.

### Datakontrakt och filurval

Båda rapporttyperna ligger direkt på `\\saas066.personal.sundsvall.se\Kommun`. Manifestens två
sökvägsinställningar pekar därför på samma delning. Även en uttrycklig undermapp
stöds, men ingen rekursiv skanning görs. SMB-jobbet väljer endast sin rapporttyp
enligt följande bekräftade filnamnsmönster:

| Rapporttyp | Filnamn (datumdelen varierar) |
| --- | --- |
| Ekonomi | `kpidata_RR_förvaltning_YYYY-MM-DD.csv` |
| Sjukfrånvaro | `kpidata_Personal_förvaltning_YYYY-MM-DD.csv` |

Även ändelsen `.txt` stöds. Stora/små bokstäver och sammansatta/uppdelade
Unicode-tecken matchas likvärdigt. Originalfilnamnet skickas oförändrat till API:t.
Filer av andra typer, andra organisationsnivåer och tillfälliga filer ignoreras.
Alla matchande filer skickas tillsammans inom storleksgränserna; datumdelen
begränsar inte vilka uttag som hämtas. Period, KPI-mått, organisation (`Enhet` →
`Organisation.kod`) och historik hanteras av befintligt import-API.

Personalexporter med kolumnerna `Period,Enhet,Mått,Kolumn,Mätvärde` kan innehålla
flera månadsstängningar. Sjukfrånvaroimporten behåller hela serien och använder
R12-exportens personalmått för att skilja den från äldre exportformat. Filnamnets
uttagsdatum är inte mätperioden. Ekonomifiler måste innehålla nettokostnadsmåttet
`SK.EK.RR.005`; en personalfil får inte bli ekonomidata.

Första versionen skickar samma avgränsade underlag vid varje körning. Backendens
upsert och urvalsregler gör omkörning säker även efter ett förlorat HTTP-svar.
Ingen separat databas eller fil med "senast importerad" skapas. Vid växande arkiv
behöver källmappen avgränsas; jobbet väljer inte godtyckligt de senaste N filerna.
Skanningen begränsas till 1 000 katalogposter totalt, även sådana som inte matchar
rapporttypen. Bekräfta mängden på den gemensamma delningen vid första provhämtningen.
En matchande fil över gränsen, ingen matchande rapport eller misslyckad hämtning stoppar hela underlaget
före API-anrop. En ändrad fil upptäcks genom storlek, filidentitet och ändringstid
före/efter läsning. SMB-handtaget tillåter inte samtidig skrivning/radering.

Minimiålder är ett extra skydd, inte bevis på färdig export. Exportägaren behöver
bekräfta att rapporterna publiceras färdiga, helst genom atomiskt namnbyte från en
annan ändelse. En pausad skrivning kan annars se ut som en färdig fil.

### Miljövariabler

| Variabel | Betydelse/default |
| --- | --- |
| `SMB_DIRECTORY` | Fullständig UNC-sökväg till delning eller undermapp, obligatorisk. Här `\\saas066.personal.sundsvall.se\Kommun` för båda jobben. |
| `SMB_USERNAME`, `SMB_PASSWORD` | Befintligt tjänstekonto med läsrätt. Inga värden skrivs till logg. |
| `IMPORT_API_URL` | Intern backendbas, i manifestet `http://big-boss-board-backend:3000`. |
| `IMPORT_TOKEN` | Befintlig API-token, via nyckeln `import-token` i backendens Secret. |
| `IMPORT_MAX_FILES` | 100; får inte överstiga API-kontraktets 100. |
| `IMPORT_MAX_FILE_BYTES` | 2 000 000 byte per fil. |
| `IMPORT_MAX_TOTAL_BYTES` | 8 000 000 byte totalt; högst 15 000 000. |
| `IMPORT_MIN_AGE_SECONDS` | 300 sekunder sedan senaste ändring. |

Jobbet läser miljön direkt och laddar ingen `.env` eller backendens
applikationsinställningar. Lokal manuell filimport är fortsatt möjlig genom
`scripts/import_ekonomi_serie.py` och `scripts/import_sjukfranvaro.py` med
standardbiblioteket; samma storleksgränser gäller, men ingen minimiålder.
Den manuella CLI-vägen läser CSV/TXT-filerna i den uttryckligt angivna lokala
mappen utan SMB-jobbets filnamnsmönster, så befintliga manuella rapportnamn fungerar.

SMB-klienten använder NTLM med obligatorisk signering och SMB3-kryptering.
Ingen montering eller privilegierad pod krävs. Kerberos-only, särskilda DFS-upplägg
eller äldre servrar måste utredas före aktivering; klienten sänker inte
säkerhetskraven automatiskt. Anslutningstid är 15 sekunder, HTTP-timeout 60
sekunder och jobbets totala deadline 600 sekunder. Deadline i OpenShift begränsar
även väntande SMB-läsningar; anslutningstimeout ensam är inte en total deadline.

### Införande och provkörning

1. Följ appens ordinarie PR-flöde: feature-branch → `develop` → `main`.
   Tekton bygger från `develop` till manifestens `envs/test/bbb`; testets image-MR
   mergas automatiskt men driftsätter ingen separat testmiljö i detta projekt.
   När ändringen når `main` bygger Tekton produktionsimagen och skapar en
   image-MR för `envs/prod/bbb` som kräver manuell granskning och merge.
   Synka manifest med båda jobbens `suspend: true` och argumentet `--dry-run` kvar.
   Jobben måste använda en SHA som innehåller den nya modulen innan de startas.
   Manifeständringen med pausade jobb kan införas före image-uppdateringen;
   inget jobb får startas med den äldre imagen. Ingen ändring av den gemensamma
   Tekton-pipelinen behövs för rapportjobben.
2. Kontrollera den bekräftade sökvägen `\\saas066.personal.sundsvall.se\Kommun` i
   `report-import-config.yaml` och fyll i det befintliga tjänstekontot i
   `report-import-smb.yaml` i GitLabs manifestrepo, enligt det valda
   Git-förvaltade driftupplägget. Apprepot innehåller inga kontouppgifter.
   Import-token refereras från backendens Secret och kopieras inte till SMB-secret.
3. Provhämta **från jobbet i rätt OpenShift-projekt**, med `--dry-run` kvar.
   Utan rätt att skapa jobb manuellt: ändra ett CronJob till `suspend: false`
   genom granskad GitLab-MR och Argo-sync. Låt det gå vid nästa schematid, eller
   ange en tillfällig överenskommen provtid i samma MR. Läs jobbloggen och pausa
   sedan schemat igen via GitLab/Argo; återställ eventuell tillfällig schematid.
   Behörig driftpersonal kan i stället skapa ett manuellt jobb från det pausade
   CronJob-manifestet enligt exemplet nedan. Ingen `pods/exec` behövs.
   Körningen verifierar DNS, TCP 445, SMB-inloggning och filläsning, men anropar
   inte API:t och validerar inte rapporternas verksamhetsinnehåll. Ge drift exakt
   starttid och jobb-/podnamn för korrelation i nätverksloggen. Åtkomst från
   databasservern räcker inte; utgående käll-IP behöver fastställas i klustret
   eller nätverksloggen. Bekräfta även färdig publicering med exportägaren.
4. Verifiera import och omkörning mot isolerad testdata/databas. `envs/test/bbb`
   i manifestrepot är fortfarande en strukturell kopia av produktion och får
   inte användas som en separat testmiljö utan egen konfiguration.
5. Med verifierad databasbackup: ta bort `--dry-run` via granskad MR och kör en
   kontrollerad produktionsimport, via samma övervakade GitOps-förfarande eller
   ett manuellt jobb som drift startar. Pausa schemat efter körningen. Stäm av
   senaste period, rätt förvaltningar, historik och resultatets `hoppade_over`.
6. Bekräfta larmmottagare och driftägare och aktivera sedan med `suspend: false`.
   Hämtning sker varje morgon: 07:00 för ekonomi och 07:20 för sjukfrånvaro i
   `Europe/Stockholm`, utanför timmen som hoppas över eller upprepas vid
   sommartidsbyte. Exakt ankomsttid behöver inte vara känd. Filer som kommer
   efter körningen tas med nästa morgon; befintligt underlag kan köras om säkert.
   Skydden mot pågående filskrivning gäller även vid daglig hämtning.

Vid återaktivering kan en missad körning inom de senaste 30 minuterna starta
direkt, eftersom `startingDeadlineSeconds` är 1 800. Planera provtiden och pausa
efter körningen; se [Kubernetes regler för paus och startfrist](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/#schedule-suspension).

Läs körningar och loggar efter provet via GitOps (ersätt `<jobbnamn>` med namnet
från listan):

```sh
oc -n web-big-boss-board get jobs --sort-by=.metadata.creationTimestamp
oc -n web-big-boss-board logs --timestamps job/<jobbnamn>
```

Alternativ för driftpersonal som får skapa jobb, efter att rätt image och
konfiguration har synkats (använd unikt jobbnamn och behåll `--dry-run`):

```sh
oc -n web-big-boss-board create job import-sjukfranvaro-prov-001 --from=cronjob/big-boss-board-import-sjukfranvaro
oc -n web-big-boss-board logs job/import-sjukfranvaro-prov-001
oc -n web-big-boss-board get job import-sjukfranvaro-prov-001
```

Håll manuella körningar åtskilda från varandra och från schemalagda körningar;
`Forbid` omfattar bara körningar som samma CronJob skapar automatiskt.

### Drift, fel och återställning

Jobbet lämnar JSON-rader med hämtat filantal/datamängd, importerade räknare och
säkra felmeddelanden. Rådata, filinnehåll, kontouppgifter och råa API-felsvar loggas
inte. HTTP-omdirigeringar följs inte. Resultat med överhoppade enheter behöver
bedömas mot befintlig organisationsmaster. Jobbet markerar även överhoppade enheter
eller noll importerade mätvärden som fel, så att felkopplade underlag inte ger ett
grönt jobb. Delvis importerade värden finns kvar och samma underlag kan köras om
efter rättning. Exit 1 markerar fel; okänt API-utfall
kan kräva kontroll innan samma underlag skickas igen.

Manifesten har `backoffLimit: 0`, `restartPolicy: Never`, 10 minuters deadline och
`concurrencyPolicy: Forbid`. Drift kan starta en kontrollerad omkörning. Nästa
schemalagda körning försöker med hela underlaget igen. Varje jobb har 256 MiB
minnesgräns, 500m CPU och 64 MiB temporär lagringsgräns. Filinnehåll hålls inom
kodens gränser i minnet, utan permanenta rådatakopior. API:t belastas också och
har en egen minnesgräns på 512 MiB; verifiera den med de verkliga filstorlekarna.

Koppla Failed Job och utebliven lyckad import till den etablerade övervakningen.
Inga externa notifieringar skickas av koden. Tre lyckade och fem misslyckade
schemalagda jobb behålls för felsökning; central logglagring följer driftens lösning.

Stoppa nya körningar genom `suspend: true` i GitLab och Argo-sync. Det stoppar
inte ett redan startat jobb: stoppa ett sådant separat vid behov. Vid akut stopp
kan drift pausa live och därefter omedelbart förankra ändringen i Git så att Argo
inte återställer schemat. Felimporterade data rättas genom granskad korrigerande
import eller riktad dataåterställning; att backa image återställer inte data.

### Ytterligare datatyper

Lägg först validering och persistens i rätt backendägare med ett uttryckligt
API-kontrakt. Utöka därefter jobbets tillåtna rapporttyper, filnamnsmönster och transportmappning,
med kontrakttest som visar rätt organisationskoppling och säker omkörning. Lägg
ett eget CronJob med egen sökväg och tid i appens manifestrepo. Samma transport
kan återanvändas när kontraktet är namngivna CSV/TXT-filer; ett annat format
behöver en uttrycklig anpassning. Inga godtyckliga API-adresser väljs från filnamn.


### Införa tolerant sjukfrånvaroimport (september 2026)

1. Ta bort det tillfälliga manifestet `import-sjukfranvaro-check.yaml` och dess
   resursrad i GitLab. Synka med prune för **just det avslutade kontrolljobbet**.
   Dess pod-template är immutable; kvarvarande diagnostikmanifest kan annars
   blockera synk när backendens image-tag uppdateras.
2. Merga appändringen till `develop`, därefter till `main`. Låt Tekton bygga och
   granska/merga produktionsimage-MR:n i GitLab. Båda CronJobs ska fortsatt ha
   `suspend: true` under införandet.
3. Verifiera aktuell databasbackup före Argo-sync. Vid backendstart lägger Alembic
   till `sjuk_underlag` (revision `d7e2f3a4b857`). Inga befintliga tabeller töms
   eller befintliga mätvärden ändras av migrationen.
4. När backend är frisk med nya imagen, skapa **ett nytt** Job från sjukfrånvarons
   CronJob, utan `--dry-run`. Gamla Jobs körs inte om av en sync.
5. Läs loggen. `importerad_med_varningar` betyder att R12-filer importerats medan
   `filer_for_kontroll` filer bevarats separat. Om enbart kontrollfiler hämtades
   visas `underlag_sparat_for_kontroll`; inga nya R12-värden har då importerats.
   Nät-, databas-, auth- och organisationskopplingsfel ska fortfarande följas upp.
6. Kontrollera R12-period, förvaltningar och ”Underlag att kontrollera” i appen.
   För provpaketet med 21 filer väntas 19 R12-filer och 2 kontrollfiler om de övriga
   filerna även klarar full validering. Bekräfta utfallet från den riktiga körningen.
7. Kör samma underlag igen: inga dubbla mätpunkter eller arkivposter ska skapas.
   `underlag_sparade` ska då vara 0. Efter avstämning kan jobben aktiveras med
   `suspend: false`: ekonomi 07:00 och sjukfrånvaro 07:20, Europe/Stockholm.

Kontrollfilerna bevaras i databasen även när en fil senare rättas. Arkivet växer bara
för nya filnamn/innehåll som behöver kontroll och ingår i databasbackupen. Det finns
ingen automatisk gallring eller e-postavisering; följ jobblogg och appens varningar.

Återgång: pausa CronJobs och återställ föregående image i GitLab/Argo. Behåll den nya
tabellen så att originalen inte försvinner. Migrationens downgrade vägrar radera
arkivet. Importerade giltiga R12-värden ligger kvar; återställ verifierad backup
endast om även dessa databasändringar behöver rullas tillbaka.
