# OpenShift/ArgoCD Prod Plan

Syftet med den här planen är att samla det som behöver göras för att köra Big Boss Board i kommunens OpenShift-flöde med GitHub, Tekton, GitLab-manifestrepo och ArgoCD.

## Problem

Repot är idag produktionsförberett för Docker Compose/Dokploy. Kommunens OpenShift-flöde bygger i stället image från GitHub, skapar image-taggar i registret, uppdaterar ett separat GitLab-manifestrepo och låter ArgoCD synka till OpenShift.

## Varför Det Spelar Roll

Prod behöver gå via kommunens etablerade deploykedja för att få rätt nät, certifikat, secrets, SSO/IdP-koppling, driftbarhet och spårbar releasehantering.

## Nuvarande Ägare

- Appkod, Dockerfiles och runtime-kontrakt: detta repo.
- Dokploy/Compose-deploy: `docs/DEPLOY.md` och `docker-compose.yml`.
- Tekton pipeline: `webapp-frontend/common-pipeline` i GitLab.
- ArgoCD-manifest: ännu inget app-specifikt GitLab-repo.

## Föreslagen Kanonisk Ägare

- Appkod och Dockerfiles stannar i detta repo.
- OpenShift-manifest ska ägas av ett nytt GitLab-repo med samma namn som GitHub-repot: `webapp-frontend/big-boss-board`.
- Tekton-watchlist ska fortsatt ägas av `webapp-frontend/common-pipeline`.
- Driftvärden och secrets ska ägas av OpenShift/Argo-konfigurationen, inte av apprepot.

## Vad Som Ska Återanvändas

- `backend/` och `frontend/` som standardmonorepo-layout.
- `backend/Dockerfile` och `frontend/Dockerfile` som imagekällor.
- `backend/entrypoint.sh` för migration och idempotent seed.
- `/api/health` som bas för probe-konfiguration, med komplettering för readiness.
- Importskripten i `scripts/` för dataimport efter deploy.

## Vad Som Ska Skapas

1. GitLab manifestrepo `webapp-frontend/big-boss-board`.
2. OpenShift resurser för:
   - frontend Deployment, Service och Route;
   - backend Deployment och Service;
   - Secret/ConfigMap för runtime-värden;
   - extern Postgres-anslutning via Secret;
   - Redis om SAML-sessioner byggs in i appen.
3. ArgoCD Application som pekar på manifestrepot.
4. Tekton `common-pipeline` ConfigMap-entry för GitHub-repot `Sundsvallskommun/big-boss-board`, branch `main`, paths `backend` och `frontend`.
5. CI-state-fil för `big-boss-board` när pipeline ska börja bevaka repot.

## Lokala Repoändringar Innan Onboarding

1. ~~Readiness endpoint~~ — byggt: `/api/ready` (503 utan databas) + oprefixade alias
   `/health`/`/ready` eftersom kustomize-basens probes antar Node-apparnas rotvägar.
2. ~~`BACKEND_INTERNAL_URL` i OpenShift~~ — byggt enligt CI-guidens runtime-mönster:
   `frontend/.env-cicd` bakar in platshållaren `http://backend-internal-url-placeholder`
   (gemen — Next normaliserar hostnamn till gemener vid bygge) och
   `frontend/entrypoint.sh` sed-ersätter i `.next` (både `*.js` och `*.json` —
   rewrite-destinationerna bor i routes-manifest.json) vid containerstart.
   Dessutom OpenShift-anpassade Dockerfiles (uid:GRUPP 0, gruppskrivbar `.next`,
   verifierat med godtyckligt UID) och PORT-konfigurerbar Gunicorn-bind
   (compose kör 8000; OpenShift sätter PORT=3000 så basens service/probes stämmer).
3. Uppdatera `docs/DEPLOY.md` eller skapa separat deploydoc när OpenShift-flödet är verkligt, så Dokploy och OpenShift inte blandas ihop.
4. Lägg till OpenShift-prodvariabler i `.env.example` när namn och env-kontrakt är beslutade.
5. ~~När SAML införs~~ — SAML är byggt (`AUTH_MODE=saml`, se `docs/SAML_SSO_PLAN.md`);
   access-kodstubben finns kvar som lokalt fallback-läge och ska inte användas i prod.

## Vad Som Inte Ska Ändras Nu

- Inga Kubernetesmanifest ska läggas i detta apprepo om organisationens mönster är separata GitLab-manifestrepon.
- Ingen riktig HME-, ekonomi- eller sjukfrånvarodata ska committas.
- Inga certifikat, nycklar, lösenord eller tokens ska committas.
- Compose/Dokploy-flödet ska inte rivas förrän OpenShift-flödet är verifierat.

## Plattformsteg

1. Skapa GitLab manifestrepo `webapp-frontend/big-boss-board`.
2. Kopiera ett närliggande webapp-manifestrepo och byt appnamn, namespace, route, image-namn och env.
3. Peka image-referenser mot `evil.sundsvall.se` och SHA-taggar som Tekton uppdaterar.
4. Skapa OpenShift namespace/projekt för prod.
5. Lägg in Secrets för databas, import-token, SAML och Redis.
6. Skapa ArgoCD Application.
7. Lägg appen i `common-pipeline`.
8. Trigga en testcommit och verifiera hela kedjan.

## Acceptance Criteria

- Tekton upptäcker commit på `main`.
- Backend- och frontend-images byggs och pushas med commit-SHA som tagg.
- GitLab-MR skapas automatiskt i `webapp-frontend/big-boss-board`.
- Efter merge synkar ArgoCD manifesten.
- Backend pod blir ready först när extern Postgres är nåbar.
- Frontend route laddar appen.
- `/api/health` och kommande `/api/ready` fungerar via route/proxy.
- Import kan köras efter deploy med `IMPORT_TOKEN`.
- SAML-login fungerar i prod innan tjänsten betraktas som klar.

## Valideringskommandon

Lokalt:

```bash
docker compose build backend frontend
docker compose up -d
curl -fsS http://localhost:3000/api/health
```

När OpenShift är anslutet:

```bash
oc get pods
oc get route
oc logs deploy/big-boss-board-backend
oc logs deploy/big-boss-board-frontend
```

## Risk Och Återställning

| Risk | Effekt | Återställning |
| --- | --- | --- |
| GitHub- och GitLab-reponamn skiljer sig | Tekton hittar inte manifestrepot | Håll båda som `big-boss-board` eller konfigurera explicit undantag |
| Frontend bakar in fel backend-URL | API-anrop går mot fel service | Använd stabilt servicenamn eller runtime-placeholder |
| Readiness returnerar OK trots trasig DB | OpenShift skickar trafik till trasig backend | Lägg till `/api/ready` som kontrollerar DB |
| Secrets saknas | Pods startar inte | Skapa Secrets före ArgoCD-sync eller pausa sync |
| Manifest kopieras från fel app | Fel route/env/resurser följer med | Reviewa alla appnamn, namespace, labels, env och image paths |

