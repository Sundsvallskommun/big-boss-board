# SAML/SSO Plan

Den här planen beskriver hur Big Boss Board bör gå från access-kodstubben till kommunens SSO via SAML/IdP.

## Problem

Appen har idag enkel åtkomstkod via `ACCESS_CODE` och `ADMIN_ACCESSCODE`. Det räcker för lokal och tidig test, men prod behöver använda kommunens IdP/SSO. Draken-projektet visar dagens etablerade mönster: backend äger SAML-login, callback, logout och session.

## Varför Det Spelar Roll

SSO behövs för prodåtkomst, gruppstyrning och en driftbar loginmodell. När SAML används får appen också server-side användarkontext som kan ersätta dagens access-kod och admin-kod.

## Nuvarande Ägare

- Access-kodstubben ägs i frontend:
  - `frontend/middleware.ts`
  - `frontend/app/login/*`
  - `frontend/lib/auth.ts`
- Backend har bara import-token-auth för admin/importflöden:
  - `backend/app/auth.py`
- Det finns ingen användarsession eller SAML i `bbb` idag.

## Föreslagen Kanonisk Ägare

- Backend ska äga SAML-protokollet, sessionen och `/api/me`.
- Frontend ska bara visa login/logout och läsa aktuell användare från backend.
- Grupp- och rollmappning ska ägas av en liten backendmodul, inte spridas i UI.
- Session store ska vara extern i prod, troligen Redis.

## Draken-Mönstret Att Återanvända Konceptuellt

Draken gör följande:

1. Frontend skickar användaren till backendens `/saml/login`.
2. Backend startar SAML mot IdP.
3. IdP postar tillbaka till backendens `/saml/login/callback`.
4. Backend extraherar claims som förnamn, efternamn, e-post, användarnamn och grupper.
5. Backend kontrollerar att användaren ingår i tillåtna grupper.
6. Backend sparar användarobjekt i session.
7. Skyddade endpoints kontrollerar sessionen.
8. Frontend hämtar inloggad användare via `/me`.
9. Logout går via backendens `/saml/logout`.

Detta ska inte kopieras rakt av eftersom `bbb` är FastAPI/Python och Draken är Express/Node. Däremot är ansvarsfördelningen relevant.

## Tekniska Beslut (Tagna — Byggt 2026-07)

Implementerat i `backend/app/auth/` (`sessions.py`, `claims.py`, `saml.py`,
`redirects.py`, `router.py`) + frontend (`middleware.ts`, `lib/auth.ts`, login-sidan):

- **SAML SP-bibliotek: python3-saml (OneLogin).** pysaml2 provades först men avvisar
  test-IdP:ns svar hårt utan konfigknappar — test-IdP:n (172.16.124.2) är en driftad
  fake-sso-idp som skickar issuer `http://localhost:7000/idp` (kvarglömd default),
  audience = en annan apps metadata-URL och tomt Recipient. python3-samls
	  `strict: false` (env `SAML_STRICT=false`) finns kvar endast som toleransprofil
	  för den kontrollerade test-IdP:n: destination/audience/recipient hoppas då över,
	  men signaturkrav (`SAML_WANT_ASSERTIONS_SIGNED` eller `SAML_WANT_MESSAGES_SIGNED`)
	  ska fortfarande vara på. Drift ska köra `SAML_STRICT=true`. IdP:n beskrivs av
	  `SAML_ENTRY_SSO` + `SAML_IDP_ENTITY_ID` (issuern i svaren) + cert. xmlsec/lxml
	  byggs från källa i Dockerfile (ABI-paritet).
- **Sessioner: session-id i HMAC-signerad cookie (`bbb_session`), data i Redis**
  (`REDIS_HOST` m.fl. — drakens env-namn, inte `SESSION_REDIS_URL`). Utan `REDIS_HOST`
  används minnesstore (endast lokalt; `WEB_CONCURRENCY=1` sätts i compose-override).
  Är `REDIS_HOST` satt men Redis onåbar vägrar backend starta (drakens beteende).
  TTL 4 dygn. Secret heter `SECRET_KEY` (drakens namn, inte `SESSION_SECRET`).
- **Cookie:** httpOnly, SameSite=Lax, path=/, Secure när callback-URL:en är https.
- **Admin styrs av IdP-grupp** (`SAML_ADMIN_GROUPS`) i saml-läget — `ADMIN_ACCESSCODE`
  gäller bara access_code-läget. Två roller: `admin` och `user`.
- **Claim-mappning** hanterar både ADFS-claim-URI:er och enkla namn (Onegate/ADFS-
  bytet 2023), som draken. Grupper normaliseras till gemener.
- **RelayState** (`success,failure`) origin-valideras i båda ändar mot konfigurerade
  redirect-URL:er (skydd mot open redirect). Fel signaleras `?failMessage=<KOD>`.
- **Rate limit** 100 anrop/min/IP på SAML-endpoints (per pod).
- **WSO2-tokentjänsten** portad till `app/services/gateway_token.py` (Redis-cache +
  NX-lås) — vilande tills bbb anropar centrala API:er.

## Förslag På Målmodell

Backend endpoints:

- `GET /api/auth/saml/login`
- `POST /api/auth/saml/callback`
- `GET /api/auth/saml/metadata`
- `POST /api/auth/logout` eller `GET /api/auth/saml/logout`
- `GET /api/me`

Backend state:

- Session-id i säker cookie.
- Sessionsdata i Redis.
- Användarobjekt med:
  - namn;
  - e-post;
  - användarnamn;
  - grupper;
  - roll;
  - admin-flagga.

Frontend:

- `/login` redirectar till backend SAML-login.
- middleware kontrollerar server-side session via backend eller intern auth-helper.
- logout rensar session via backend.
- adminvyer visas baserat på `/api/me`, inte `ADMIN_ACCESSCODE`.

## Miljövariabler Och Secrets

Env-kontraktet följer drakens namn så att OpenShift-manifestens secret-mönster
(`test-saml-keys`/`backend-secrets`) kan återanvändas rakt av — se `.env.example`:

```env
AUTH_MODE=saml
SECRET_KEY=
REDIS_HOST=
REDIS_PORT=6379
REDIS_PASSWORD=
SAML_ISSUER=
SAML_ENTRY_SSO=
SAML_IDP_ENTITY_ID=
SAML_CLOCK_SKEW=300
SAML_STRICT=true
SAML_WANT_ASSERTIONS_SIGNED=true
SAML_WANT_MESSAGES_SIGNED=false
SAML_CALLBACK_URL=
SAML_LOGOUT_CALLBACK_URL=
SAML_SUCCESS_REDIRECT=
SAML_FAILURE_REDIRECT=
SAML_IDP_PUBLIC_CERT=
SAML_PUBLIC_KEY=
SAML_PRIVATE_KEY=
SAML_ALLOWED_GROUPS=
SAML_ADMIN_GROUPS=
```

Alla certifikat, privata nycklar och session secrets ska ligga i OpenShift Secrets.

## Lokala Repoändringar

1. ~~Lägg till tydligt `AUTH_MODE`~~ — byggt (`access_code` fallback, `saml` för prod).
2. ~~Inför backendmodul för auth/session~~ — byggt (`backend/app/auth/`).
3. ~~Lägg till session store med Redis som krav i prod~~ — byggt (startvägran vid onåbar Redis).
4. ~~Lägg till `/api/me`~~ — byggt.
5. ~~Flytta adminbeslut till backend-användarens roll/grupper~~ — byggt (`isAdmin()` läser
   `/api/me` i saml-läget).
6. ~~Uppdatera frontend login/logout för SAML-läget~~ — byggt: login-sidan + avatar-meny
   i headern (`UserMenu`/`UserBadge`/`ui/Avatar`) som visar inloggad användare (namn,
   e-post, admin-badge) och "Logga ut". Utloggning rensar lokala sessionen och, via
   `SAML_IDP_LOGOUT_URL`, IdP-sessionen (test-IdP:n hanterar inte SAML SLO-requests —
   dess `/logout?RelayState=`-route används i stället; SLO-koden togs bort).
7. Behåll import-token separat. `IMPORT_TOKEN` är maskin-till-maskin och ska inte ersättas
   av SAML. (Oförändrat — middleware släpper igenom `/api/import` + `/api/admin` i båda lägena.)
8. ~~Lägg till tester~~ — byggt (`backend/tests/`): saknad/giltig/manipulerad session, fel
   grupp, admin-grupp, logout, RelayState-validering, claim-mappning. Callback testas med
   fejkad SAML-klient — riktig XML-validering verifieras mot test-IdP:n.

## Vad Som Inte Ska Ändras Nu

- Inga riktiga IdP-certifikat eller privata nycklar i repo.
- Ingen personuppgiftsloggning av fullständiga SAML-profiler.
- Ingen Draken-specifik rollmodell ska kopieras. `bbb` behöver egna roller: vanlig användare och admin räcker initialt.
- Import-endpoints ska fortsätta skyddas med `IMPORT_TOKEN`.

## Acceptance Criteria

- Oinloggad användare skickas till login.
- Login går via kommunens IdP.
- Callback skapar server-side session.
- `/api/me` returnerar aktuell användare utan att exponera onödiga claims.
- Användare utan tillåten grupp nekas.
- Adminvyer visas endast för admin-grupp.
- Session överlever pod-rotation genom Redis.
- Logout avslutar lokal session och skickar användaren till rätt post-logout-sida.

## Validering

Lokalt med stub/testläge:

```bash
docker compose build backend frontend
docker compose up -d
curl -i http://localhost:3000/api/me
```

I prod/OpenShift:

```bash
oc logs deploy/big-boss-board-backend
oc get secret
oc get pods
```

Manuell verifiering:

1. Öppna route.
2. Starta login.
3. Slutför IdP-login.
4. Kontrollera att dashboard laddas.
5. Kontrollera `/api/me`.
6. Logga ut.
7. Kontrollera att skyddad vy kräver ny login.

## Risk Och Återställning

| Risk | Effekt | Återställning |
| --- | --- | --- |
| Fel SAML-callback URL | IdP kan inte posta tillbaka | Korrigera IdP/SP-konfiguration och Secret |
| Session lagras i pod | Login tappas vid rollout | Kräv Redis i prod |
| För bred gruppåtkomst | Fel användare får åtkomst | Tillåt endast explicita IdP-grupper |
| Claims skiljer sig mellan IdP-miljöer | Login misslyckas trots rätt användare | Stöd tydligt mappade claimnamn och logga bara saknade fältnamn |
| Admin styrs fortsatt av kod | SSO ger inte faktisk behörighetsstyrning | Flytta admin till IdP-grupp |
