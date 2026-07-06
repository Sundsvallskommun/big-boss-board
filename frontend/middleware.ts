import { NextRequest, NextResponse } from "next/server";

/** Gatar tjänsten server-side i två lägen (AUTH_MODE):
 *
 *  - "access_code" (default): access-kod-stubben (BYGGPLAN §12). ACCESS_CODE (vanlig)
 *    och ADMIN_ACCESSCODE (admin — ser även import-GUI). Ingen kod satt kräver
 *    ALLOW_OPEN_ACCESS=true, annars fail-closed.
 *  - "saml": backend äger sessionen (SAML mot kommunens IdP). Middleware validerar
 *    sessionskakan mot backendens /api/me på varje förfrågan.
 */
const ACCESS_COOKIE = "bbb_access";
const SESSION_COOKIE = "bbb_session";
const BACKEND = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";
const AUTH_MODES = new Set(["access_code", "saml"]);

function authMode(): "access_code" | "saml" | null {
  const mode = process.env.AUTH_MODE || "access_code";
  return AUTH_MODES.has(mode) ? (mode as "access_code" | "saml") : null;
}

function allowOpenAccess(): boolean {
  return process.env.ALLOW_OPEN_ACCESS === "true";
}

export async function middleware(req: NextRequest) {
  const mode = authMode();
  if (mode === null) return authConfigError(req);
  if (mode === "saml") return samlGate(req);
  return accessCodeGate(req);
}

function authConfigError(req: NextRequest) {
  const detail = "Åtkomst är inte korrekt konfigurerad.";
  if (req.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.json({ detail }, { status: 503 });
  }
  return new NextResponse(detail, {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

async function samlGate(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/login")) return NextResponse.next();
  // SAML-flödets egna endpoints måste vara nåbara utloggad (login/callback/metadata).
  if (pathname.startsWith("/api/auth")) return NextResponse.next();
  if (pathname.startsWith("/api/health")) return NextResponse.next();
  // Import/admin är maskin-till-maskin med egen token-auth (IMPORT_TOKEN) i backend.
  if (pathname.startsWith("/api/import") || pathname.startsWith("/api/admin"))
    return NextResponse.next();

  const value = req.cookies.get(SESSION_COOKIE)?.value;
  if (value) {
    try {
      const res = await fetch(`${BACKEND}/api/me`, {
        headers: { cookie: `${SESSION_COOKIE}=${value}` },
        cache: "no-store",
      });
      if (res.ok) return NextResponse.next();
    } catch {
      // Backend onåbar → behandla som utloggad (login-sidan förklarar inget fel,
      // men datavyerna skulle ändå inte kunna laddas).
    }
  }

  if (pathname.startsWith("/api")) {
    return NextResponse.json({ detail: "Behörighet krävs." }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

function accessCodeGate(req: NextRequest) {
  const code = process.env.ACCESS_CODE;
  const admin = process.env.ADMIN_ACCESSCODE;

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login")) return NextResponse.next();
  // Import- och admin-endpointen är maskin-till-maskin och har egen token-auth
  // (IMPORT_TOKEN) i backend — de ska inte gatas av UI-access-koden, så att
  // CLI/automation kommer åt dem.
  if (pathname.startsWith("/api/import") || pathname.startsWith("/api/admin"))
    return NextResponse.next();

  if (!code && !admin) {
    return allowOpenAccess() ? NextResponse.next() : authConfigError(req);
  }

  const value = req.cookies.get(ACCESS_COOKIE)?.value;
  const giltig = (!!code && value === code) || (!!admin && value === admin);
  if (giltig) return NextResponse.next();

  if (pathname.startsWith("/api")) {
    return NextResponse.json({ detail: "Behörighet krävs." }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  // Kör på allt utom statiska Next-resurser.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand).*)"],
};
