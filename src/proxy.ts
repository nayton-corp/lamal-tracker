import { NextResponse, type NextRequest } from "next/server";
import { passwordEnabled, SESSION_COOKIE, validSession } from "./server/auth";

export function proxy(request: NextRequest) {
  if (!passwordEnabled()) return NextResponse.next();
  if (validSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) return new NextResponse("Non autorisé", { status: 401 });
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!login|_next/|icons/|ocr/|manifest.webmanifest|sw.js|offline.html|api/health|favicon.ico).*)"],
};
