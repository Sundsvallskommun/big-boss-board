# Införande av Jaris produktfunktioner

Bas: Sundsvallskommun/main a3515f0. Källa: jarikoponen/main 33f2706.
Arbetsgren: feature/jari-produktfunktioner.

Kommunens SAML/ADFS, Redis-sessioner, behörigheter, användarmeny och OpenShift-konfiguration
är befintliga ägare och ska behållas. Inga produktionsdata importeras i detta arbete.

## Etapp 1 — ekonomiimport

Problem: enkelperiodimport kunde tömma historiken. Filnamnens prefix kunde avgöra vilket
uttag som vann och tabbexporter stöddes inte.

Ägare: services/ekonomi_import.py. Återanvänder befintlig normalisering/upsert och tar in
Jaris seriebevarande och formatstöd. Namngivna uttag väljs nu i backend via
/api/import/ekonomi-filer; CLI skickar filerna utan en andra implementation av urvalsregeln.
Ordinarie uttag måste vara dag 1–9 månaden efter rapportperioden. Om sådant saknas väljs
senaste tillgängliga uttag. Flera perioder i en ekonomifil avvisas.
En äldre enkelperiod fyller bara på historiken. En explicit serieimport ersätter serien.

Verifiering: `python3 /Users/maxeriksson/.codex/scripts/run-guarded.py --seconds 120 -- backend/.venv/bin/python -m pytest backend/tests/test_ekonomi_import.py -q`
Resultat: 6 tester godkända (CSV/TXT, BOM, förvaltningsfilter, urval, historik och periodfel).
Inga serverstarter, fulla byggen eller databasmigrationer har körts.

Återtagning: denna etapp kan återtas med sin commit. Inga schemaändringar i databasen.
Äldre /ekonomi-serie finns kvar för befintliga klienter som redan skickar valda perioder.

## Etapp 2 — produktfunktioner och gemensamma datakontrakt

Infört från Jaris produktarbete fram till dc54342:

- Budget–prognos i ekonomins kort och månadsdiagram. Det oanvända nettokostnadsdiagrammet
  är borttaget. Underliggande resultaträkning sparas fortfarande.
- R12-sjukfrånvaro, kvartalstrend, larm på snabb ökning, historikbevarande och uppskattad
  årskostnad. Kostnadstexten förklarar att personalantalet är en ögonblicksbild, schablonen
  ger inte ett exakt historiskt kostnadsutfall. Reservantalet är uttryckligen daterat.
- HME-total och tre delperspektiv, organisationsspecifika frågor, Stadsbacken och MRF,
  rubriksatta verksamhetsfrågor och enkätursprung för kommunikativt ledarskap.
- Återstående aktiviteter på statusrapporter, uppdaterad statusväljare och informationsrutor
  i portal med fokus vid öppning och återgång vid stängning/Escape.
- Webbimport av flera CSV/TXT-filer och HME-totalindex + delindex. CLI och webb använder
  samma backendnormalisering. Inget byte av inloggning eller API-proxy.

Ägarskap och rättningar:

- `services/ekonomi.py` äger tecken, saknat underlag, status och tolkning. Import och
  `MeasurementOut` använder samma bedömning. Läsprojektionen gör också redan lagrade
  ackumulerade huvudfält konsekventa med den nya definitionen före nästa import.
- Saknad prognos ger null i värde/status, aldrig ett påhittat noll/grönt besked. En extra
  migration gör dessa två measurement-kolumner nullable; manuella statusar ändras inte.
- Aprilrättningen för Barn och utbildning är avgränsad till kod 24, april 2026 och budget
  -2972,31 mnkr. Skälet och källcommit följer med i underlaget. Ändrad budget kräver
  omprövning i stället för en tyst överskrivning. Ta bort rättningen när källexporten rättats.
- R12 kontrolleras i backend även för direkt-API. Export utan personalmått kan inte
  verifieras som R12 och avvisas. Normaliserad payload kräver uttrycklig mätmetod.
  Gammal monterad personalfil stoppas från import vid seed utan att blockera appstart;
  befintliga äldre värden visas som "Inväntar R12" tills nytt underlag importerats.
- HME-perspektiv bevaras vid efterföljande totalindeximport. Explicit tom perspektivkarta
  kan rensa dem. Ingen separat HME-omvandling finns längre i webb/CLI.
- Gemensam API-transport ger omförsök bara för läsningar. Skrivning görs en gång med
  timeout och tydligt besked om okänt utfall; kommunens rewrite/sessionstransport behålls.
- Historiska statiska rapporter finns i `docs/rapporter/`, märkta som ögonblicksbilder.
  De publiceras inte som om de vore aktuella vyer. Jaris prototyp är inte en produktfunktion.

Verifierat: 24 produkt-/importtester (varav databasprov i SQLite-minne och HTTP-kontrakt),
16 befintliga auth/redirect-tester, senare ytterligare ett seedprov (upprepad start med gammal
personalfil), tre små frontendtester och TypeScript. Ruff godkänd på ändrade backendägare.
Alla sex migrationer genererar PostgreSQL-SQL utan databasanslutning. Detta ersätter inte
ett faktiskt migrationsprov i PostgreSQL eller visuell granskning i webbläsare.

Kommandon (alltid under global supervisor):

- `backend/.venv/bin/python -m pytest backend/tests/test_ekonomi_import.py backend/tests/test_product_imports.py backend/tests/test_auth_api.py backend/tests/test_redirects.py -q`
- `node --experimental-transform-types --test --test-concurrency=1 frontend/tests/product.test.mjs`
- `frontend/node_modules/.bin/tsc --noEmit --incremental false -p frontend/tsconfig.json`
- I backend: `DATABASE_URL=postgresql+asyncpg://test:test@localhost:65500/test .venv/bin/python -m alembic upgrade a0d5e6f7b109:head --sql`

Inför drift: ta databassnapshot, kör sex migrationer och seed enligt befintlig deployväg,
importera aktuellt R12-underlag och HME-delindex. Detta arbete har inte hämtat eller ändrat
driftens data. Seed uppdaterar allmänna frågor och skapar koncernverksamheterna; statusrapporters
befintliga innehåll skrivs inte över. Fältet återstående aktiviteter fylls via befintligt admin-API.

Återtagning: återställ kodversion och databassnapshot tillsammans om importer hunnit köras.
Nullable-migrationens downgrade vägrar om nullvärden finns; den fabricerar inte en gammal
status. Senare importer har också ändrat mätmetoden, vilket enbart schema-downgrade inte återställer.

### Etapp 2, slutgranskning — redan lagrade enkelperioder

Ett databasprov visade ytterligare ett övergångsfall: en äldre mätning kan ha ett aktuellt
huvudvärde utan någon sparad serie. Vid historisk påfyllning måste även dess aktuella punkt
föras in i serien. Importresultatet projiceras också genom samma MeasurementOut-kontrakt,
så gammal lagrad ackumulerad status inte läcker ut i importsvaret. 26 produkt-/importtester
passerar efter tillägget. Detta ligger i en separat korrigeringscommit före biblioteksetappen.

## Etapp 3 — frontendbibliotek, avskilt från produktlogik

Next 16.3.4, React 19.2.8, Recharts 3.10.1 och Tailwind 4.3.3 är införda med npm-låsfil.
Node 22, Python, Dockerfiler, SAML/Redis, middleware, behörighetskod, användarmeny,
OpenShift-prober och runtime-ersättning är oförändrade jämfört med kommunens a3515f0.
Jaris backenduppgraderingar och Dokploy-härdning är inte överförda: de tillhör driftvarianten.

- `globals.css` äger hela tokenlagret med `@theme`. Den gamla Tailwind-konfigurationen
  och autoprefixer är borttagna. Kommunens extra hover-token är bevarad. CSS-sökningen
  är uttryckligen avgränsad till app och components. Ändringar i markup avser v4:s
  motsvarande utilities för fokus, skugga och gradient.
- Sjukfrånvarografen använder Recharts publika skal-/ritområdeshooks i stället för
  privata `Customized`-fält. Tooltip-typerna är anpassade utan `any`.
- Webpack anges uttryckligen i dev/build så att ramverksuppgraderingen inte samtidigt
  byter kommunens byggverktyg. Next 16:s befintliga middlewarestöd används; filen byts
  inte till Jaris `proxy.ts`. `typecheck` ersätter det borttagna `next lint`-kommandot.

Verifierat med global supervisor: npm-installation, TypeScript, CSS-genereringsprov,
tre produktprov och ett prov av kommunens oförändrade middleware med det installerade
Next 16. Middlewareprovet kontrollerar sessionscookie till /api/me, nekad utgången session,
SAML-/import-/probe-undantag samt nekad felkonfiguration. Ingen appserver eller komplett
produktionbyggnad har startats. Största uppmätta processminnet för biblioteksinstallationen
var cirka 444 MiB; detta avser endast den övervakade processen.

Källor för anpassningarna:

- [Next 16: Node-krav, Webpack och fortsatt middlewarestöd](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Tailwind 4: CSS-konfiguration, utilitynamn och webbläsarkrav](https://tailwindcss.com/docs/upgrade-guide)
- [Recharts 3: egna lager och tooltip-typer](https://github.com/recharts/recharts/wiki/3.0-migration-guide)

Tailwind 4 kräver moderna webbläsare (Safari 16.4+, Chrome 111+, Firefox 128+).
Kontrollera användarnas klienter vid införande. Faktisk SAML-inloggning mot kommunens IdP,
OpenShift-bygge/rollout, PostgreSQL-migration och visuell/tangentbordsgranskning i webbläsare
återstår för driftmiljön. De är inte ersatta av en lokal typkontroll.

Återtagning: biblioteksetappen kan återtas som egen commit utan databasändring. Produkt-
etappernas datakontrakt och migreringskrav är separata. Arbetsgrenens ändringar är inte
pushade eller driftsatta. Den befintliga oincheckade `backend/uv.lock` har lämnats orörd.
