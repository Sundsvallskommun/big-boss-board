# Deploy — `bbb.sundsvall.dev` via Dokploy

Operativ checklista för att driftsätta stacken. Bakgrund och motivering finns i
[`BYGGPLAN.md`](BYGGPLAN.md) §9–§12.

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
   - `ACCESS_CODE` — sätt ett värde för att kräva åtkomstkod (tom = öppen tjänst).
   - `BACKEND_INTERNAL_URL=http://backend:8000` (default räcker normalt).
   - `HME_DATA_DIR` — värdkatalog med `hme_2025.json` (se steg 5).
4. **Persistent volym:** säkerställ att `db-data` är en bestående volym.
5. **HME-data (utanför git).** Aggregatet `hme_2025.json` versionshanteras inte (innehåller
   riktiga, anonymiserade siffror). Generera det med `python3 scripts/build_hme_aggregate.py`
   från råfilen, ladda upp det till en katalog på Dokploy-värden och sätt `HME_DATA_DIR` till
   den sökvägen — den bind-monteras read-only till backend. Saknas filen startar appen ändå,
   men med enbart referensdata (väljaren visar tomt läge tills datan finns på plats).
6. **Deploya.** Vid start kör backend automatiskt `alembic upgrade head` → seed
   (idempotent) → Gunicorn.

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
