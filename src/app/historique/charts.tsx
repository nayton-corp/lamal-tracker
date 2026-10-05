"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HouseholdHistory } from "@/application/history";
import { cn } from "@/ui/cn";
import { formatPermille } from "@/domain/money";

const SERIES = ["#2563eb", "#db2777", "#0891b2", "#7c3aed", "#ea580c", "#65a30d"];
const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)" };
const chf = (v: unknown) => `CHF ${Number(v).toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function TotalsChart({ totals }: { totals: HouseholdHistory["totals"] }) {
  const data = totals.map((t) => ({
    year: String(t.year),
    total: t.billedMonthlyRp / 100,
    label: t.changePermille === null ? "" : formatPermille(t.changePermille),
  }));
  return (
    <div className="h-56" role="img" aria-label={`Prime mensuelle du foyer par année : ${data.map((d) => `${d.year} ${chf(d.total)}`).join(", ")}`}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 24, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="year" stroke="var(--muted)" fontSize={12} tickLine={false} />
          <YAxis stroke="var(--muted)" fontSize={12} width={44} tickFormatter={(v) => `${v}`} />
          <Tooltip formatter={chf} contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="total" name="Foyer / mois" fill="var(--primary)" radius={[6, 6, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey="label" position="top" fontSize={11} fill="var(--muted)" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PersonChart({ persons, years }: { persons: HouseholdHistory["persons"]; years: number[] }) {
  const [selected, setSelected] = useState<number | "all">("all");
  const shown = selected === "all" ? persons : persons.filter((p) => p.personId === selected);
  const data = years.map((y) => {
    const row: Record<string, number | string | null> = { year: String(y) };
    for (const p of shown) {
      const pt = p.points.find((x) => x.year === y);
      row[p.name] = pt ? pt.netMonthlyRp / 100 : null;
      if (selected !== "all") row["Médiane du marché"] = pt?.marketMedianRp ? pt.marketMedianRp / 100 : null;
      if (selected !== "all") row["Moins cher du marché"] = pt?.marketMinRp ? pt.marketMinRp / 100 : null;
    }
    return row;
  });
  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Personne affichée">
        {[{ id: "all" as const, name: "Tous" }, ...persons.map((p) => ({ id: p.personId, name: p.name }))].map((o) => (
          <button
            key={o.id}
            aria-pressed={selected === o.id}
            onClick={() => setSelected(o.id)}
            className={cn("min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium", selected === o.id ? "border-primary bg-primary text-on-primary" : "border-border bg-surface")}
          >
            {o.name}
          </button>
        ))}
      </div>
      <div className="h-64" role="img" aria-label="Évolution de la prime nette mensuelle par personne">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="year" stroke="var(--muted)" fontSize={12} />
            <YAxis stroke="var(--muted)" fontSize={12} width={44} />
            <Tooltip formatter={chf} contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {shown.map((p) => (
              <Line key={p.personId} dataKey={p.name} stroke={SERIES[persons.indexOf(p) % SERIES.length]} strokeWidth={2.5} dot={{ r: 4 }} connectNulls isAnimationActive={false} />
            ))}
            {selected !== "all" && <Line dataKey="Médiane du marché" stroke="var(--muted)" strokeDasharray="6 4" dot={false} connectNulls isAnimationActive={false} />}
            {selected !== "all" && <Line dataKey="Moins cher du marché" stroke="var(--saving)" strokeDasharray="2 4" dot={false} connectNulls isAnimationActive={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {selected !== "all" && <p className="text-sm text-muted">Repères de marché : même canton, région, classe d&apos;âge et franchise, pour les années dont les primes sont importées.</p>}
    </div>
  );
}

/** Prime du foyer comparée à ce qu'il aurait payé au prix médian et au prix le plus bas du marché. */
export function MarketChart({ totals }: { totals: HouseholdHistory["totals"] }) {
  const data = totals
    .filter((t) => t.marketMedianMonthlyRp !== null)
    .map((t) => ({
      year: String(t.year),
      "Votre foyer": t.billedMonthlyRp / 100,
      "Médiane du marché": t.marketMedianMonthlyRp! / 100,
      "Moins cher du marché": t.marketMinMonthlyRp! / 100,
    }));
  if (data.length === 0) return <p className="text-sm text-muted">Importez les primes des années passées (Réglages) pour situer votre foyer dans le marché.</p>;
  return (
    <div className="h-64" role="img" aria-label={`Prime mensuelle du foyer comparée au marché : ${data.map((d) => `${d.year} ${chf(d["Votre foyer"])} contre médiane ${chf(d["Médiane du marché"])}`).join(", ")}`}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="year" stroke="var(--muted)" fontSize={12} />
          <YAxis stroke="var(--muted)" fontSize={12} width={44} />
          <Tooltip formatter={chf} contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line dataKey="Votre foyer" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 4 }} isAnimationActive={false} />
          <Line dataKey="Médiane du marché" stroke="var(--muted)" strokeDasharray="6 4" dot={false} isAnimationActive={false} />
          <Line dataKey="Moins cher du marché" stroke="var(--saving)" strokeDasharray="2 4" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
