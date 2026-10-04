import { NextResponse, type NextRequest } from "next/server";
import { adminNeedsFactor, passwordToDefine, touchSession } from "@/application/auth";
import { db, nowIso } from "@/server/context";

/**
 * Contrôle d'accès de chaque requête : aucun compte → création du premier ; pas de session →
 * connexion. L'administrateur sans second facteur est conduit à son compte pour en ajouter un.
 * Seuls les fichiers statiques de la PWA, /api/health, la présentation et les pages d'accès ou
 * légales passent sans session. Sans session, « / » affiche la présentation publique.
 */
const PUBLIC = /^\/(login|inscription|verifier|presentation|confidentialite|conditions|mentions-legales)(\/|$)/;
const SESSION_COOKIES = ["__Host-lamal_session", "lamal_session"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (passwordToDefine(db())) {
    if (pathname === "/login/creer") return NextResponse.next();
    if (pathname.startsWith("/api/")) return new NextResponse("Mot de passe à définir", { status: 401 });
    return NextResponse.redirect(new URL("/login/creer", request.url));
  }
  if (pathname === "/login/creer") return NextResponse.redirect(new URL("/login", request.url));
  if (PUBLIC.test(pathname)) return NextResponse.next();
  const token = SESSION_COOKIES.map((n) => request.cookies.get(n)?.value).find(Boolean);
  const session = touchSession(db(), token, nowIso());
  if (session) {
    if (!pathname.startsWith("/compte") && !pathname.startsWith("/api/") && adminNeedsFactor(db(), session.userId)) {
      return NextResponse.redirect(new URL("/compte?requis=1", request.url));
    }
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) return new NextResponse("Non autorisé", { status: 401 });
  if (pathname === "/") return NextResponse.rewrite(new URL("/presentation", request.url));
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/|icons/|apercus/|manifest\\.webmanifest$|sw\\.js$|offline\\.html$|api/health$|favicon\\.ico$|\\.well-known/).*)"],
};
