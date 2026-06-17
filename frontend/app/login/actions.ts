"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type LoginState = { error?: string };

const COOKIE = "bbb_access";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const code = process.env.ACCESS_CODE;
  // Ingen kod konfigurerad → tjänsten är öppen.
  if (!code) redirect("/");

  const entered = String(formData.get("code") ?? "");
  if (entered !== code) {
    return { error: "Fel kod. Försök igen." };
  }

  (await cookies()).set(COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  redirect("/");
}
