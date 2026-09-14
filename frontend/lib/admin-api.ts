/** Server-side anrop mot backendens admin-endpoints (inkorgen på /status).
 *
 *  Behörigheten avgörs av backend (`auth/admin_access.py`): import-token ELLER inloggad
 *  admin-session. Härifrån väljs vägen per auth-läge:
 *  - saml: sessionskakan vidarebefordras — backend läser rollen ur sin egen session,
 *    och frontend behöver ingen IMPORT_TOKEN.
 *  - access_code: backend har ingen session, så IMPORT_TOKEN (server-side, aldrig i
 *    webbläsaren) används; `isAdmin()` har redan gatat anroparen.
 *  Anropas endast från server-komponenter/-actions. */

import { cookies } from "next/headers";
import { SESSION_COOKIE, isSamlMode } from "@/lib/auth";

export interface Submission {
  id: number;
  text: string;
  status: string;
  notering: string | null;
  skapad_at: string;
  uppdaterad_at: string | null;
}

export const BACKEND = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";

/** Auth-headers för ett admin-anrop, eller null om ingen väg är tillgänglig. */
export async function adminAuthHeaders(): Promise<Record<string, string> | null> {
  if (isSamlMode()) {
    const value = (await cookies()).get(SESSION_COOKIE)?.value;
    return value ? { cookie: `${SESSION_COOKIE}=${value}` } : null;
  }
  const token = process.env.IMPORT_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

/** Lista inkomna inlämningar (inkorgen), nyast först. Tom lista om behörighet saknas
 *  eller backend inte svarar — inkorgen får aldrig blockera status-sidan. */
export async function listSubmissionsAdmin(): Promise<Submission[]> {
  const auth = await adminAuthHeaders();
  if (!auth) return [];
  try {
    const res = await fetch(`${BACKEND}/api/admin/submissions`, {
      headers: auth,
      cache: "no-store",
      // Får aldrig hänga status-sidan om backend är trög/onåbar.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}
