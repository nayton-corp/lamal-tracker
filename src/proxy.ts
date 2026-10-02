import { NextResponse, type NextRequest } from "next/server";

/**
 * Protection facultative par mot de passe (authentification HTTP Basic) quand APP_PASSWORD est défini.
 * Recommandé seulement si l'app est exposée au-delà du réseau local ou de Tailscale.
 */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  const user = process.env.APP_USER ?? "lamal";
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const [u, ...rest] = atob(header.slice(6)).split(":");
      if (safeEqual(u ?? "", user) && safeEqual(rest.join(":"), password)) return NextResponse.next();
    } catch {
      // en-tête mal formé : on redemande les identifiants
    }
  }
  return new NextResponse("Authentification requise", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="LAMal Tracker", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!api/health|_next/static|_next/image|icons/|sw\\.js|manifest\\.webmanifest|offline\\.html|favicon\\.ico).*)"],
};
