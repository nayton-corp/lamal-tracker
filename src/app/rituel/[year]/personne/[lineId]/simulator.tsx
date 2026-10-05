"use client";

import { Calculator } from "lucide-react";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { healthCostsAction } from "@/app/actions/review";
import type { CurvePoint } from "@/domain/cost";
import { formatChf, rpToInput } from "@/domain/money";
import { ActionForm } from "@/ui/action-form";
import { Button } from "@/ui/button";
import { Sheet } from "@/ui/sheet";
import { SubmitButton } from "@/ui/submit";

const COLORS = ["#2563eb", "#0891b2", "#7c3aed", "#db2777", "#ea580c", "#65a30d", "#0d9488"];

export function FranchiseSimulator({ lineId, franchises, points, breakEvenRp, healthCostsRp }: {
  lineId: number;
  franchises: number[];
  points: CurvePoint[];
  breakEvenRp: number | null;
  healthCostsRp: number;
}) {
  const max = points.at(-1)?.healthCostsRp ?? 1_000_000;
  const step = points[1]?.healthCostsRp ?? 10_000;
  const [h, setH] = useState(Math.min(healthCostsRp, max));
  const data = useMemo(
    () => points.map((p) => ({ x: p.healthCostsRp / 100, ...Object.fromEntries(franchises.map((f, i) => [`F${f}`, Math.round(p.totals[i]! / 100)])) })),
    [points, franchises],
  );
  const at = points.reduce((best, p) => (Math.abs(p.healthCostsRp - h) < Math.abs(best.healthCostsRp - h) ? p : best), points[0]!);

  if (franchises.length < 2) return null;
  return (
    <Sheet
      title="Quelle franchise ?"
      description="Coût annuel total (prime nette + franchise + quote-part) de la meilleure offre par franchise."
      trigger={
        <Button variant="secondary" size="sm">
          <Calculator aria-hidden className="size-4" /> Simulateur de franchise
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="h-64 w-full" role="img" aria-label={`Coût total selon les frais de santé ; la franchise ${franchises[0]} devient avantageuse dès ${breakEvenRp === null ? "jamais" : formatChf(breakEvenRp, { whole: true })}.`}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="x" type="number" domain={[0, max / 100]} tickFormatter={(v) => `${Math.round(v / 1000)}k`} stroke="var(--muted)" fontSize={12} />
              <YAxis domain={["dataMin - 200", "dataMax + 200"]} tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} stroke="var(--muted)" fontSize={12} width={40} />
              <Tooltip
                formatter={(v) => `CHF ${Number(v).toLocaleString("fr-CH")}`}
                labelFormatter={(v) => `Frais : CHF ${Number(v).toLocaleString("fr-CH")}`}
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)" }}
              />
              {franchises.map((f, i) => (
                <Line key={f} dataKey={`F${f}`} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} isAnimationActive={false} />
              ))}
              <ReferenceLine x={h / 100} stroke="var(--foreground)" strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm" aria-label="Légende">
          {franchises.map((f, i) => (
            <li key={f} className="flex items-center gap-1">
              <span aria-hidden className="inline-block h-0.5 w-4" style={{ background: COLORS[i % COLORS.length] }} /> F {f}
            </li>
          ))}
        </ul>
        <label className="block space-y-2">
          <span className="flex justify-between text-sm font-medium">
            Frais de santé annuels <span className="tabular">{formatChf(h, { whole: true })}</span>
          </span>
          <input type="range" min={0} max={max} step={step} value={h} onChange={(e) => setH(Number(e.target.value))} className="w-full accent-[var(--primary)]" />
        </label>
        <div className="rounded-xl bg-surface-2 p-3 text-sm">
          <p>
            À ce niveau, la franchise la plus avantageuse est <strong>CHF {at.bestFranchiseChf}</strong>.
          </p>
          <p className="text-muted">
            {breakEvenRp === null
              ? `La franchise ${franchises[0]} n'est jamais la moins chère sur cette plage.`
              : `La franchise ${franchises[0]} devient la moins chère dès ${formatChf(breakEvenRp, { whole: true })} de frais par an.`}
          </p>
        </div>
        <ActionForm action={healthCostsAction} hidden={{ lineId, healthCosts: rpToInput(h, 0) }}>
          <SubmitButton variant="secondary" block>
            Utiliser {formatChf(h, { whole: true })} comme frais attendus
          </SubmitButton>
        </ActionForm>
        <p className="text-xs text-muted">Rappel : la contribution hospitalière (15 CHF/jour) n&apos;est pas incluse. Pour une franchise élevée, gardez une réserve de trésorerie.</p>
      </div>
    </Sheet>
  );
}
