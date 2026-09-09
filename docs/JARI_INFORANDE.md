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
