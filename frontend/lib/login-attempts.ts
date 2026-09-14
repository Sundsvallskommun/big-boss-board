import { isIP } from "node:net";

/** Begränsning per frontend-process, för det alternativa access_code-läget.
 * Bokför försöket före första await så samtidiga anrop inte passerar samma lucka.
 * SAML:s begränsning och Redis-sessioner ägs fortsatt av backend.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const MAX_CLIENTS = 10_000;
type Window = { attempts: number; expires: number };
const clients = new Map<string, Window>();
let globalWindow: Window = { attempts: 0, expires: 0 };

export function loginClient(headers: Headers): string {
  // Samma proxykontrakt som backendens SAML-limiter: sista X-Forwarded-For-posten
  // kommer från ingressen. Klientstyrda prefix får inte välja räknare.
  const address = (headers.get("x-forwarded-for")?.split(",").at(-1) ?? "").trim();
  if (isIP(address) === 4) return address;
  if (isIP(address) !== 6) return "unknown";
  const normalized = new URL(`http://[${address}]`).hostname.slice(1, -1);
  const [left, right] = normalized.split("::");
  const start = left ? left.split(":") : [];
  const end = right ? right.split(":") : [];
  const groups = right === undefined ? start : [
    ...start, ...Array.from({ length: 8 - start.length - end.length }, () => "0"), ...end,
  ];
  const parts = groups.map((group) => parseInt(group, 16));
  if (parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff) {
    return [parts[6] >> 8, parts[6] & 255, parts[7] >> 8, parts[7] & 255].join(".");
  }
  return groups.slice(0, 4).map((group) => group.padStart(4, "0")).join(":") + "::/64";
}

/** null = spärrad; annars fördröjning före kodkontrollen. */
export function reserveLoginAttempt(client: string): number | null {
  const now = Date.now();
  if (globalWindow.expires <= now) globalWindow = { attempts: 0, expires: now + WINDOW_MS };
  let window = clients.get(client);
  if (window && window.expires > now && window.attempts >= MAX_ATTEMPTS) return null;
  if (!window || window.expires <= now) {
    for (const [id, old] of clients) if (old.expires <= now) clients.delete(id);
    // En full tabell ska varken växa eller låta klienter slå ut en pågående spärr.
    if (!clients.has(client) && clients.size >= MAX_CLIENTS) return null;
    window = { attempts: 0, expires: now + WINDOW_MS };
    clients.set(client, window);
  }
  window.attempts++;
  globalWindow.attempts++;
  return globalWindow.attempts > 100 ? 2000 : 0;
}
