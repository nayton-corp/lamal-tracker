import { formatChf, formatPercentBp, type Rappen } from "@/domain/money";
import { cn } from "./cn";

/** Montant formaté en chiffres tabulaires. */
export function Chf({ rp, className, compact }: { rp: Rappen; className?: string; compact?: boolean }) {
  return <span className={cn("num whitespace-nowrap", className)}>{formatChf(rp, { compact })}</span>;
}

/**
 * Variation de prime : le sens n'est jamais porté par la couleur seule (signe + flèche + texte).
 * Hausse = rouge, baisse = vert.
 */
export function Delta({ rp, bp, suffix, className }: { rp: Rappen; bp?: number | null; suffix?: string; className?: string }) {
  const arrow = rp === 0 ? "→" : rp > 0 ? "▲" : "▼";
  return (
    <span
      className={cn(
        "num inline-flex flex-wrap items-baseline gap-x-1 font-semibold",
        rp < 0 && "text-down",
        rp > 0 && "text-up",
        rp === 0 && "text-muted",
        className,
      )}
    >
      <span aria-hidden className="text-[0.75em]">
        {arrow}
      </span>
      <span className="whitespace-nowrap">
        {formatChf(rp, { signed: true })}
        {suffix}
      </span>
      {bp !== undefined && bp !== null && <span className="whitespace-nowrap text-[0.85em] font-medium">({formatPercentBp(bp)})</span>}
      <span className="sr-only">{rp > 0 ? "hausse" : rp < 0 ? "baisse" : "stable"}</span>
    </span>
  );
}

/** Économie (positive) ou surcoût (négatif) annuel par rapport à une référence. */
export function Saving({ rp, className, suffix = "/an" }: { rp: Rappen; className?: string; suffix?: string }) {
  if (rp === 0) return <span className={cn("num text-muted", className)}>Même coût</span>;
  const saving = rp > 0;
  return (
    <span className={cn("num inline-flex flex-wrap items-baseline gap-x-1 font-semibold", saving ? "text-down" : "text-up", className)}>
      <span aria-hidden className="text-[0.75em]">
        {saving ? "▼" : "▲"}
      </span>
      <span>{saving ? "Économie" : "Surcoût"}</span>
      <span className="whitespace-nowrap">
        {formatChf(Math.abs(rp), { compact: true })}
        {suffix}
      </span>
    </span>
  );
}
