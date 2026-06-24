import { NextRequest, NextResponse } from "next/server";

/** Access-kod-stub (BYGGPLAN §12). Gatar tjänsten server-side. Två koder stöds:
 *  ACCESS_CODE (vanlig åtkomst) och ADMIN_ACCESSCODE (admin — ser även import-GUI).
 *  Är ingen av dem satt är tjänsten öppen (lokal utveckling). */
const COOKIE = "bbb_access";

export function middleware(req: NextRequest) {
  const code = process.env.ACCESS_CODE;
  const admin = process.env.ADMIN_ACCESSCODE;
  if (!code && !admin) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login")) return NextResponse.next();
  // Import-endpointen är maskin-till-maskin och har egen token-auth (IMPORT_TOKEN) i
  // backend — den ska inte gatas av UI-access-koden, så att CLI/automation kommer åt den.
  if (pathname.startsWith("/api/import")) return NextResponse.next();

  const value = req.cookies.get(COOKIE)?.value;
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
