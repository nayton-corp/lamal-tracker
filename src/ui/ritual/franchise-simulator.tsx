"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AgeClass } from "@/domain/age-class";
import { costInputFor, expectedAnnualCost, franchiseCurve, recommendFranchise } from "@/domain/cost-model";
import type { LamalParameters } from "@/domain/lamal-parameters";
import { formatChf } from "@/domain/money";

const COLORS = ["#1f4fd8", "#067a46", "#b45309", "#7c3aed", "#c4271b", "#0e7490", "#475569"];

/**
 * Simulateur : coût annuel total de chaque franchise d'un produit selon les frais de santé attendus.
 * Le calcul utilise le même modèle que le serveur (domaine pur partagé).
 */
export function FranchiseSimulator({
  options,
  params,
  ageClass,
  initialHealthCostsRp,
  co2AnnualRp,
  title,
}: {
  options: { franchiseChf: number; monthlyPremiumRp: number }[];
  params: LamalParameters;
  ageClass: AgeClass;
  initialHealthCostsRp: number;
  co2AnnualRp: number | null;
  title: string;
}) {
  const [health, setHealth] = useState(initialHealthCostsRp);
  const max = Math.max(800_000, initialHealthCostsRp * 2);
  const curve = useMemo(() => franchiseCurve(options, params, ageClass, max, 32), [options, params, ageClass, max]);
  const rec = useMemo(() => recommendFranchise(options, params, ageClass, health), [options, params, ageClass, health]);
  const data = curve.map((p) => ({ x: p.healthCostsRp / 100, ...Object.fromEntries(Object.entries(p.costs).map(([f, c]) => [`f${f}`, c / 100])) }));
  const rows = options.map((o) => ({
    ...o,
    total: expectedAnnualCost(costInputFor(params, ageClass, o.monthlyPremiumRp, o.franchiseChf, health, co2AnnualRp)).totalRp,
  }));
  const best = Math.min(...rows.map((r) => r.total));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{title}</p>
      <label className="flex flex-col gap-2">
        <span className="flex items-baseline justify-between text-sm font-medium">
          Frais de santé attendus
          <span className="num text-base font-bold">{formatChf(health, { compact: true })}/an</span>
        </span>
        <input
          type="range"
          min={0}
          max={max}
          step={5000}
          value={health}
          onChange={(e) => setHealth(Number(e.target.value))}
          className="h-10 w-full accent-[var(--primary)]"
          aria-valuetext={formatChf(health, { compact: true })}
        />
      </label>
      <div className="h-56 w-full" aria-hidden>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              type="number"
              domain={[0, max / 100]}
              tickFormatter={(v) => `${Math.round(v / 1000)}k`}
              stroke="var(--muted)"
              fontSize={11}
            />
            <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} stroke="var(--muted)" fontSize={11} width={40} />
            <Tooltip
              formatter={(v, name) => [formatChf(Math.round(Number(v) * 100), { compact: true }), `Franchise ${String(name).slice(1)}`]}
              labelFormatter={(v) => `Frais ${formatChf(Math.round(Number(v) * 100), { compact: true })}`}
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
            />
            <ReferenceLine x={health / 100} stroke="var(--text)" strokeDasharray="4 4" />
            {options.map((o, i) => (
              <Line
                key={o.franchiseChf}
                type="linear"
                dataKey={`f${o.franchiseChf}`}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={rec?.franchiseChf === o.franchiseChf ? 3 : 1.5}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="num w-full text-sm">
        <caption className="sr-only">Coût annuel total par franchise</caption>
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-1 font-medium">Franchise</th>
            <th className="py-1 text-right font-medium">Prime/mois</th>
            <th className="py-1 text-right font-medium">Coût total/an</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.franchiseChf} className={r.total === best ? "font-bold text-down" : ""}>
              <td className="py-1.5">
                <span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} aria-hidden />
                {r.franchiseChf}
                {r.total === best && <span className="ml-1 text-xs">★ idéale</span>}
              </td>
              <td className="py-1.5 text-right">{formatChf(r.monthlyPremiumRp)}</td>
              <td className="py-1.5 text-right">{formatChf(r.total, { compact: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rec && (
        <p className="rounded-xl bg-surface-2 p-3 text-sm">
          Avec {formatChf(health, { compact: true })} de frais par an, la franchise <strong>{rec.franchiseChf}</strong> est la moins chère.
          {rec.switchBelowAtRp !== null && (
            <>
              {" "}
              Au-delà d&apos;environ {formatChf(rec.switchBelowAtRp, { compact: true })} de frais, une franchise plus basse devient plus avantageuse.
            </>
          )}
        </p>
      )}
    </div>
  );
}
