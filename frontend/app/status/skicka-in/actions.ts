"use server";

/** Tar emot en inlämning från det publika formuläret och postar den till backend.
 *  Sidan (och denna route) gatas redan av access-koden i middleware — ingen extra
 *  auth behövs. Ingen import-token: detta är publik intake, inte maskin-import. */

export type SubmitState = { ok?: boolean; message?: string };

const MAX_LEN = 4000;

export async function submitSynpunkt(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  // Honeypot: ett dolt fält som människor inte ser. Ifyllt → sannolikt bot, släng tyst
  // (svara som om allt gick bra så att boten inte får signal att försöka igen).
  if (String(formData.get("kontakt") ?? "").trim()) {
    return { ok: true, message: "Tack! Din inlämning har tagits emot." };
  }

  const text = String(formData.get("text") ?? "").trim();
  if (!text) {
    return { ok: false, message: "Skriv något i textrutan först." };
  }
  if (text.length > MAX_LEN) {
    return { ok: false, message: `Texten är för lång (max ${MAX_LEN} tecken).` };
  }

  const backend = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";
  let res: Response;
  try {
    res = await fetch(`${backend}/api/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, message: "Kunde inte nå tjänsten. Försök igen om en stund." };
  }

  if (!res.ok) {
    return { ok: false, message: `Något gick fel (HTTP ${res.status}). Försök igen.` };
  }

  return {
    ok: true,
    message: "Tack! Din inlämning har tagits emot och hamnar i arbetsgruppens inkorg.",
  };
}
