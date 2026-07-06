# Deploy — `bbb.sundsvall.dev` via Dokploy

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
