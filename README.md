# Big Boss Board (bbb)

Dialogstöd för chefsuppföljning. En chef går igenom nyckeltal område för område
tillsammans med en underställd chef och fångar överenskommelser direkt i samtalet.

> Internt arbetsnamn (visas aldrig i UI). Publik domän: `bbb.sundsvall.dev`.
> Appen används **endast för öppen och publik information**. All dummydata är fiktiv.

## Stack

- **Frontend:** Next.js 15 + React 19 + TypeScript, Sundsvalls designsystem (`@sk-web-gui`).
- **Backend:** FastAPI + SQLAlchemy 2.0 + Pydantic v2 + Alembic, PostgreSQL 16.
- **Infra:** Docker Compose via Dokploy + Traefik.

Se [`docs/BYGGPLAN.md`](docs/BYGGPLAN.md) för fullständig plan och [`CLAUDE.md`](CLAUDE.md) för regler.

## Kom igång lokalt

```bash
cp .env.example .env      # justera POSTGRES_PASSWORD och DATABASE_URL vid behov
docker compose up --build
```

- Frontend: <http://localhost:3000>
- Backend health (via proxy): <http://localhost:3000/api/health>
- API-docs (i utveckling): backend `/api/docs`

## Struktur

```
bbb/
├─ CLAUDE.md              # projektregler för Claude Code
├─ docker-compose.yml
├─ .env.example
├─ docs/                  # BYGGPLAN.md + prototyp
├─ backend/               # FastAPI
└─ frontend/              # Next.js
```
