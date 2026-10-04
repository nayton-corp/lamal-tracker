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

/**
 * Politique de contenu stricte : seuls les scripts portant le nonce de la requête s'exécutent
 * (Next l'applique aux siens). Les styles en ligne restent permis (attributs `style`), les images
 * en data: aussi (signatures dessinées, QR code du double facteur). Pas d'upgrade-insecure-requests :
 * l'instance du Pi tourne aussi en HTTP local ; HTTPS est imposé par le mandataire (HSTS).
 */
function contentSecurityPolicy(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Laisse passer la requête (ou l'envoie vers `rewrite`) avec le nonce des scripts de la page. */
function next(request: NextRequest, rewrite?: string): NextResponse {
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = rewrite ? NextResponse.rewrite(new URL(rewrite, request.url), { request: { headers } }) : NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (passwordToDefine(db())) {
    if (pathname === "/login/creer") return next(request);
    if (pathname.startsWith("/api/")) return new NextResponse("Mot de passe à définir", { status: 401 });
    return NextResponse.redirect(new URL("/login/creer", request.url));
  }
  if (pathname === "/login/creer") return NextResponse.redirect(new URL("/login", request.url));
  if (PUBLIC.test(pathname)) return next(request);
  // En HTTPS, seul le cookie préfixé `__Host-` compte (voir readCookie).
  const https = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
  const token = (https ? SESSION_COOKIES.slice(0, 1) : SESSION_COOKIES).map((n) => request.cookies.get(n)?.value).find(Boolean);
  const session = touchSession(db(), token, nowIso());
  if (session) {
    if (!pathname.startsWith("/compte") && !pathname.startsWith("/api/") && adminNeedsFactor(db(), session.userId)) {
      return NextResponse.redirect(new URL("/compte?requis=1", request.url));
    }
    return next(request);
  }
  if (pathname.startsWith("/api/")) return new NextResponse("Non autorisé", { status: 401 });
  if (pathname === "/") return next(request, "/presentation");
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/|icons/|apercus/|manifest\\.webmanifest$|sw\\.js$|offline\\.html$|api/health$|favicon\\.ico$|\\.well-known/).*)"],
};
