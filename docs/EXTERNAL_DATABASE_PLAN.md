# External Postgres Plan

Den här planen beskriver hur databasen ska hanteras när appen körs i prod och datat ska överleva deployer.

## Problem

I Compose kör appen en Postgres-container med namngiven volym. I prod ska app-containrar kunna ersättas utan att data påverkas. Databasen ska därför inte ligga i frontend- eller backend-poddarnas filsystem.

## Varför Det Spelar Roll

Appen lagrar dialoger, aktiviteter, statusinnehåll, importerade mätvärden och inkorgsposter. En deploy, pod-rotation eller image-uppdatering får inte radera detta.

## Nuvarande Ägare

- Lokal/Dokploy databasform: `docker-compose.yml`.
- Datamodell: `backend/app/models.py`.
- Migrationer: `backend/alembic/versions/`.
- Uppstartsmigrering: `backend/entrypoint.sh`.
- Seed/import: `backend/app/seed.py` och `scripts/`.

## Föreslagen Kanonisk Ägare

- Databasdrift, backup och restore ägs av intern prodserver/driftmiljö.
- Apprepot äger schema, migrationer och importkontrakt.
- OpenShift Secret äger anslutningssträngen `DATABASE_URL`.

## Beslut

Databasen kan ligga på en annan intern prodserver och knytas till appen via `DATABASE_URL`.

Det innebär:

- ingen Postgres pod krävs i samma OpenShift-app;
- ingen appdata lagras i containerfilsystem;
- backend ansluter till intern Postgres över nät;
- credentials ligger i OpenShift Secret;
- backup/restore hanteras utanför appen.

## Lokala Repoändringar

1. Dokumentera extern Postgres i deploydokumentationen när servernamn och driftmodell är bestämda.
2. Säkerställ att `DATABASE_URL` är enda runtime-kontraktet backend behöver för databasen.
3. Lägg till `/api/ready` som failar när DB inte kan nås.
4. Bestäm om `backend/entrypoint.sh` ska fortsätta köra `alembic upgrade head` automatiskt i prod.
5. Om automatisk migrering behålls: dokumentera att en ny release kan ändra schema vid podstart.
6. Om automatisk migrering tas bort i prod: skapa separat migrationsjobb i OpenShift/Argo.
7. Lägg till backup/restore-notering i deploydokumentation, men lägg inte drifthemligheter i repo.

## Rekommenderad Prodmodell

1. Intern Postgres-server skapas av drift.
2. Databas och användare skapas:
   - databas: `big_boss_board` eller driftens standardnamn;
   - appuser med minsta nödvändiga rättigheter;
   - separat admin/migrationsrättighet om drift vill skilja dessa.
3. OpenShift Secret innehåller:

```env
DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@HOST:5432/DBNAME
```

4. Backend Deployment läser `DATABASE_URL` från Secret.
5. NetworkPolicy/firewall tillåter backend-poddar att nå Postgres-servern.
6. Backup och restore verifieras innan skarp användning.

## Migrationer

Nuvarande modell:

- backend startar;
- `alembic upgrade head` körs;
- idempotent seed körs;
- Gunicorn startar.

Detta är enkelt och fungerar bra när bara en backend-pod startar åt gången. I OpenShift/prod behöver vi välja ett av två mönster:

### Alternativ A: Behåll Migration Vid Startup

Fördel:

- enklast att driftsätta;
- ingen separat pipeline behövs.

Nackdel:

- flera pods kan försöka migrera samtidigt om rollout inte styrs;
- schemaändring sker implicit vid appstart.

Krav:

- kör backend med en pod under migration eller använd rolloutstrategi som undviker parallell start;
- Alembic-migrationer måste vara idempotenta där det är relevant;
- loggar måste kontrolleras efter deploy.

### Alternativ B: Separat Migrationsjobb

Fördel:

- tydligare releasekontroll;
- app-poddar startar först efter schema är uppdaterat.

Nackdel:

- kräver extra Argo/OpenShift-resurs och pipelinebeslut.

Krav:

- Job/Cron-liknande manifest eller Argo hook;
- backend image används för att köra `alembic upgrade head`;
- app Deployment väntar på eller syncas efter jobbet.

## Seed Och Import

Seed ska fortsatt vara idempotent och bara skapa/uppdatera referensdata. Riktig data ska importeras efter deploy via token-skyddade endpoints:

- HME;
- ekonomi;
- sjukfrånvaro.

Rådata och aggregat ska inte versionshanteras. I prod bör import-endpoints med `IMPORT_TOKEN` vara huvudvägen, inte filmount.

## Acceptance Criteria

- Backend ansluter till extern intern Postgres via `DATABASE_URL`.
- Data finns kvar efter backend/frontend redeploy.
- Migrationer körs enligt valt mönster och syns i logg.
- `/api/ready` returnerar fel när DB är nere.
- Backup/restore-ägare är utsedd.
- Import fungerar efter deploy.
- Inga databaslösenord finns i git.

## Validering

Lokalt mot extern eller test-Postgres:

```bash
DATABASE_URL='postgresql+asyncpg://USER:PASSWORD@HOST:5432/DBNAME' docker compose up -d backend frontend
curl -fsS http://localhost:3000/api/health
```

OpenShift:

```bash
oc get secret
oc logs deploy/big-boss-board-backend
oc exec deploy/big-boss-board-backend -- python -c "import os; print('DATABASE_URL' in os.environ)"
```

Dataverifiering:

1. Skapa eller importera data.
2. Redeploya backend och frontend.
3. Kontrollera att samma data finns kvar.
4. Verifiera backup enligt driftens rutin.

## Risk Och Återställning

| Risk | Effekt | Återställning |
| --- | --- | --- |
| DB ligger i pod/container | Data försvinner vid redeploy | Flytta till extern Postgres eller PVC innan prod |
| Fel `DATABASE_URL` | Backend startar men DB är unavailable | Korrigera Secret och rollouta om backend |
| Automatisk migrering körs parallellt | Race vid schemaändring | Separera migrationsjobb eller styr rollout |
| Ingen backup | Data kan inte återställas | Kräv backup/restore-verifiering före skarp drift |
| Seed skriver över manuellt innehåll | Oväntad dataändring | Håll seed idempotent och begränsad till referensdata |

