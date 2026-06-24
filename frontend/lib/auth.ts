import { cookies } from "next/headers";

/** Namn på access-kakan (sätts vid inloggning, valideras i middleware). */
export const ACCESS_COOKIE = "bbb_access";

/** Är den inloggade sessionen en admin? Sant endast när ADMIN_ACCESSCODE är satt
 *  OCH användaren loggat in med just den koden (inte den vanliga access-koden). */
export async function isAdmin(): Promise<boolean> {
  const admin = process.env.ADMIN_ACCESSCODE;
  if (!admin) return false;
  const value = (await cookies()).get(ACCESS_COOKIE)?.value;
  return value === admin;
}
