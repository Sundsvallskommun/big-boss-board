import { cookies } from "next/headers";

/** Namn på access-kakan (access_code-läget: sätts vid inloggning, valideras i middleware). */
export const ACCESS_COOKIE = "bbb_access";

/** Namn på sessionskakan (saml-läget: sätts av backend vid SAML-callback). */
export const SESSION_COOKIE = "bbb_session";

/** Användarobjektet från backendens /api/me (saml-läget). */
export type SessionUser = {
  name: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  groups: string[];
  role: "admin" | "user";
};

const BACKEND = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";

export function authMode(): "access_code" | "saml" | "invalid" {
  const mode = process.env.AUTH_MODE || "access_code";
  if (mode === "access_code" || mode === "saml") return mode;
  return "invalid";
}

export function isSamlMode(): boolean {
  return authMode() === "saml";
}

/** Hämtar inloggad användare från backend-sessionen (saml-läget). Null om utloggad
 *  eller om saml-läget inte är aktivt. Server-only — anropas från server-komponenter. */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isSamlMode()) return null;
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  try {
    const res = await fetch(`${BACKEND}/api/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${value}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as SessionUser;
  } catch {
    return null;
  }
}

/** Är den inloggade sessionen en admin?
 *  saml-läget: rollen från backend (/api/me) styr — IdP-gruppmedlemskap.
 *  access_code-läget: sant endast när ADMIN_ACCESSCODE är satt OCH användaren
 *  loggat in med just den koden (inte den vanliga access-koden). */
export async function isAdmin(): Promise<boolean> {
  if (isSamlMode()) {
    return (await getSessionUser())?.role === "admin";
  }
  const admin = process.env.ADMIN_ACCESSCODE;
  if (!admin) return false;
  const value = (await cookies()).get(ACCESS_COOKIE)?.value;
  return value === admin;
}
