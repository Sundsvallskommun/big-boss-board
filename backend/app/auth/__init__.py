"""Auth-paketet.

Två separata spår som aldrig ska blandas ihop:

- `import_token` — maskin-till-maskin (dataimport/triage) via `IMPORT_TOKEN`.
- `sessions`/`saml`/`router` — användarinloggning via kommunens IdP (SAML) med
  server-side sessioner. Aktiv endast när `AUTH_MODE=saml`.

Import- och adminroutrarna använder `AdminAccessRoute` från `admin_access`
(import-token eller inloggad admin-session).
"""
