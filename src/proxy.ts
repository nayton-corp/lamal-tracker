import { NextResponse, type NextRequest } from "next/server";
import { hasPassword, touchSession } from "@/application/auth";
import { db, nowIso } from "@/server/context";
import { SESSION_COOKIE } from "@/server/auth";

/**
 * Contrôle d'accès de chaque requête : pas de mot de passe défini → sa création ; pas de
 * session → connexion. Seuls les fichiers statiques de la PWA et /api/health passent.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const onLogin = pathname === "/login" || pathname.startsWith("/login/");
  if (!hasPassword(db())) {
    if (pathname === "/login/creer") return NextResponse.next();
    if (pathname.startsWith("/api/")) return new NextResponse("Mot de passe à définir", { status: 401 });
    return NextResponse.redirect(new URL("/login/creer", request.url));
  }
  if (pathname === "/login/creer") return NextResponse.redirect(new URL("/login", request.url));
  if (onLogin || touchSession(db(), request.cookies.get(SESSION_COOKIE)?.value, nowIso())) return NextResponse.next();
  if (pathname.startsWith("/api/")) return new NextResponse("Non autorisé", { status: 401 });
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/|icons/|manifest\\.webmanifest$|sw\\.js$|offline\\.html$|api/health$|favicon\\.ico$).*)"],
};
