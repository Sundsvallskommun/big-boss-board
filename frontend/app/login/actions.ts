"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE } from "@/lib/auth";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const code = process.env.ACCESS_CODE;
  const admin = process.env.ADMIN_ACCESSCODE;
  // Ingen kod konfigurerad alls → endast öppen när det uttryckligen tillåts lokalt.
  if (!code && !admin) {
    if (process.env.ALLOW_OPEN_ACCESS === "true") redirect("/");
    return { error: "Inloggning är inte konfigurerad." };
  }

  const entered = String(formData.get("code") ?? "");
  // Giltig om koden matchar vanlig access-kod eller admin-kod (om de är satta).
  const matchar = (!!code && entered === code) || (!!admin && entered === admin);
  if (!matchar) {
    return { error: "Fel kod. Försök igen." };
  }

  // Lagra den inmatade koden — middleware och isAdmin() avgör behörighet utifrån den.
  (await cookies()).set(ACCESS_COOKIE, entered, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  redirect("/");
}
