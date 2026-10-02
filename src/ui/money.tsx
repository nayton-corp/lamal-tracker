import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatChf, formatPermille } from "@/domain/money";
import { cn } from "./cn";

export function Chf({ rp, whole, className }: { rp: number | null | undefined; whole?: boolean; className?: string }) {
  if (rp === null || rp === undefined) return <span className={cn("text-muted", className)}>—</span>;
  return <span className={cn("tabular", className)}>{formatChf(rp, { whole })}</span>;
}

/** Variation : hausse en rouge avec flèche montante, baisse en vert avec flèche descendante. */
export function Delta({ rp, permille, whole, className, suffix }: { rp: number | null; permille?: number | null; whole?: boolean; className?: string; suffix?: string }) {
  if (rp === null) return <span className="text-muted">—</span>;
  const up = rp > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1 tabular font-medium", rp === 0 ? "text-muted" : up ? "text-increase" : "text-saving", className)}>
      <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
        {rp !== 0 && <Icon aria-hidden className="size-4" />}
        {formatChf(rp, { signed: true, whole })}
        {suffix}
      </span>
      {permille !== undefined && permille !== null && <span className="whitespace-nowrap text-sm opacity-80">({formatPermille(permille)})</span>}
    </span>
  );
}

/** Économie : positif = on paie moins. */
export function Saving({ rp, className }: { rp: number | null; className?: string }) {
  if (rp === null) return null;
  if (rp <= 0) return <span className={cn("text-sm text-muted tabular", className)}>{rp === 0 ? "même coût" : `${formatChf(-rp, { whole: true })} de plus/an`}</span>;
  return <span className={cn("font-semibold text-saving tabular", className)}>−{formatChf(rp, { whole: true })}/an</span>;
}
