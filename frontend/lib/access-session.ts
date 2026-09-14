/** Kodinloggningens cookie är skild från backendens SAML-cookie bbb_session.
 * HMAC-skyddad roll och utgångstid; själva åtkomstkoden lämnar aldrig servern.
 * Web Crypto används även av middleware. Rotation av hemlighet/koder river sessionerna.
 */
export const ACCESS_COOKIE = "bbb_access";
export const ACCESS_MAX_AGE_S = 8 * 60 * 60;
export type AccessRole = "user" | "admin";

const encoder = new TextEncoder();

export function accessSessionConfigError(): string | null {
  return (process.env.SESSION_SECRET?.length ?? 0) < 32
    ? "Kodinloggning kräver SESSION_SECRET med minst 32 tecken."
    : null;
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function key(): Promise<CryptoKey> {
  const error = accessSessionConfigError();
  if (error) throw new Error(error);
  return crypto.subtle.importKey(
    "raw", encoder.encode(process.env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
}

function signedContent(payload: string): Uint8Array<ArrayBuffer> {
  // Koderna ingår i det signerade innehållet, så en kodrotation även återkallar
  // redan utfärdade sessioner. Den oberoende hemligheten skyddar mot kodgissning offline.
  return encoder.encode(JSON.stringify([
    payload, process.env.ACCESS_CODE ?? "", process.env.ADMIN_ACCESSCODE ?? "",
  ]));
}

export async function createAccessSession(role: AccessRole): Promise<string> {
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const expires = Math.floor(Date.now() / 1000) + ACCESS_MAX_AGE_S;
  const payload = `v1.${role}.${expires}.${nonce}`;
  const signature = await crypto.subtle.sign("HMAC", await key(), signedContent(payload));
  return `${payload}.${base64url(new Uint8Array(signature))}`;
}

export async function verifyAccessSession(token: string | undefined): Promise<AccessRole | null> {
  if (!token || accessSessionConfigError()) return null;
  const match = /^(v1\.(user|admin)\.([0-9]{10})\.[A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const [, payload, role, expires, signature] = match;
  const now = Math.floor(Date.now() / 1000);
  if (Number(expires) <= now || Number(expires) > now + ACCESS_MAX_AGE_S) return null;
  if (role === "admin" ? !process.env.ADMIN_ACCESSCODE : !process.env.ACCESS_CODE) return null;
  const bytes = Uint8Array.from(atob(signature.replace(/-/g, "+").replace(/_/g, "/") + "="), (c) => c.charCodeAt(0));
  const valid = await crypto.subtle.verify("HMAC", await key(), bytes, signedContent(payload));
  return valid ? (role === "admin" ? "admin" : "user") : null;
}
