import { appUrl } from "@/server/accounts";
import { operator } from "@/server/operator";

export const dynamic = "force-dynamic";

/** Où signaler une faille (RFC 9116), d'après CONTACT_EMAIL ; introuvable tant qu'il n'est pas défini. */
export function GET() {
  const { contact } = operator();
  if (!contact) return new Response("Introuvable", { status: 404 });
  const expires = new Date(Date.now() + 365 * 86_400_000).toISOString();
  const base = appUrl();
  const lines = [
    `Contact: mailto:${contact}`,
    `Expires: ${expires}`,
    "Preferred-Languages: fr, en",
    ...(base ? [`Canonical: ${base}/.well-known/security.txt`, `Policy: ${base}/mentions-legales`] : []),
  ];
  return new Response(`${lines.join("\n")}\n`, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
