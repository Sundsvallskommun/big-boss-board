"""Auth-paketet.

Två separata spår som aldrig ska blandas ihop:

- `import_token` — maskin-till-maskin (dataimport/triage) via `IMPORT_TOKEN`.
- `sessions`/`saml`/`router` — användarinloggning via kommunens IdP (SAML) med
  server-side sessioner. Aktiv endast när `AUTH_MODE=saml`.

`require_import_token` re-exporteras här så befintliga imports
(`from app.auth import require_import_token`) fungerar oförändrat.
"""

from app.auth.import_token import require_import_token

__all__ = ["require_import_token"]
