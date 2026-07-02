/** Server-side admin-hämtning mot token-skyddade backend-endpoints.
 *
 *  Använder IMPORT_TOKEN (hålls server-side, aldrig i webbläsaren) precis som
 *  admin-import-actionen. Anropas endast från server-komponenter/-actions. */

export interface Submission {
  id: number;
  text: string;
  status: string;
  notering: string | null;
  skapad_at: string;
  uppdaterad_at: string | null;
}

/** Lista inkomna inlämningar (inkorgen), nyast först. Tom lista om token saknas
 *  eller backend inte svarar — inkorgen får aldrig blockera status-sidan. */
export async function listSubmissionsAdmin(): Promise<Submission[]> {
  const token = process.env.IMPORT_TOKEN;
  if (!token) return [];
  const backend = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";
  try {
    const res = await fetch(`${backend}/api/admin/submissions`, {
      headers: { Authorization: `Bearer ${token}` },
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
