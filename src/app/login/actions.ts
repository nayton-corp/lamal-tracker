"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, SESSION_COOKIE, sessionToken } from "@/server/auth";
import type { ActionState } from "@/server/action";

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  if (!checkPassword(String(form.get("password") ?? ""))) {
    await new Promise((r) => setTimeout(r, 800));
    return { error: "Mot de passe incorrect." };
  }
  const proto = (await headers()).get("x-forwarded-proto") ?? "http";
  (await cookies()).set(SESSION_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  const next = String(form.get("next") || "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
