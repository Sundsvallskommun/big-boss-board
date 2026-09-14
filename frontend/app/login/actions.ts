"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authMode } from "@/lib/auth";
import { ACCESS_COOKIE, ACCESS_MAX_AGE_S, accessSessionConfigError, createAccessSession } from "@/lib/access-session";
import { loginClient, reserveLoginAttempt } from "@/lib/login-attempts";

export type LoginState = { error?: string };

function matchesCode(entered: string, expected: string | undefined): boolean {
  if (!expected) return false;
  return timingSafeEqual(
    createHash("sha256").update(entered).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (authMode() !== "access_code") return { error: "Kodinloggning är inte aktiverad." };
  const code = process.env.ACCESS_CODE;
  const admin = process.env.ADMIN_ACCESSCODE;
  // Ingen kod konfigurerad alls → endast öppen när det uttryckligen tillåts lokalt.
  if (!code && !admin) {
    if (process.env.ALLOW_OPEN_ACCESS === "true") redirect("/");
    return { error: "Inloggning är inte konfigurerad." };
  }

  if (accessSessionConfigError()) return { error: "Inloggning är inte korrekt konfigurerad." };
  const client = loginClient(await headers());
  const delay = reserveLoginAttempt(client);
  if (delay === null) return { error: "För många försök. Vänta 15 minuter och försök igen." };
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  const entered = String(formData.get("code") ?? "");
  const role = matchesCode(entered, admin) ? "admin" : matchesCode(entered, code) ? "user" : null;
  if (!role) {
    return { error: "Fel kod. Försök igen." };
  }

  // En giltig vanlig kod får inte nollställa spärren för gissningar på admin-koden.
  (await cookies()).set(ACCESS_COOKIE, await createAccessSession(role), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCESS_MAX_AGE_S,
  });
  redirect("/");
}
