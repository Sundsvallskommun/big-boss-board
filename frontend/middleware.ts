import { NextRequest, NextResponse } from "next/server";

/** Enkel access-kod-stub (BYGGPLAN §12). Gatar tjänsten server-side.
 *  Är ingen ACCESS_CODE satt är tjänsten öppen (lokal utveckling). */
const COOKIE = "bbb_access";

export function middleware(req: NextRequest) {
  const code = process.env.ACCESS_CODE;
  if (!code) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login")) return NextResponse.next();

  if (req.cookies.get(COOKIE)?.value === code) return NextResponse.next();

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
