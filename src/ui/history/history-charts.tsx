"use client";

import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatChf } from "@/domain/money";

const COLORS = ["#1f4fd8", "#067a46", "#7c3aed", "#c4271b", "#0e7490", "#475569"];

export interface PersonSeries {
  firstName: string;
  points: { year: number; monthlyRp: number | null; marketMedianRp: number | null; projected: boolean }[];
}

const chf = (v: number) => formatChf(Math.round(v * 100), { compact: true });

/** Prime mensuelle de chaque personne, avec la médiane du marché pour le même profil en pointillés. */
export function PremiumLines({ people, years }: { people: PersonSeries[]; years: number[] }) {
  const data = years.map((year) => {
    const row: Record<string, number | null> = { year };
    people.forEach((p, i) => {
      const pt = p.points.find((x) => x.year === year);
      row[`p${i}`] = pt?.monthlyRp != null ? pt.monthlyRp / 100 : null;
      row[`m${i}`] = pt?.marketMedianRp != null ? pt.marketMedianRp / 100 : null;
    });
    return row;
  });
  return (
    <div className="h-64 w-full" role="img" aria-label="Évolution des primes mensuelles par personne">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 12, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={chf} width={64} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(v) => (typeof v === "number" ? chf(v) : "–")}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {people.map((p, i) => (
            <Line
              key={`p${i}`}
              dataKey={`p${i}`}
              name={p.firstName}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2.5}
              dot={{ r: 3 }}
              connectNulls
              type="monotone"
            />
          ))}
          {people.map((p, i) => (
            <Line
              key={`m${i}`}
              dataKey={`m${i}`}
              name={`Médiane marché (${p.firstName})`}
              stroke={COLORS[i % COLORS.length]}
              strokeOpacity={0.45}
              strokeDasharray="4 4"
              dot={false}
              connectNulls
              type="monotone"
              legendType="plainline"
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Total annuel net du foyer, année projetée en couleur atténuée. */
export function HouseholdBars({ totals }: { totals: { year: number; netAnnualRp: number; projected: boolean }[] }) {
  const data = totals.map((t) => ({ year: t.projected ? `${t.year}*` : String(t.year), net: t.netAnnualRp / 100 }));
  return (
    <div className="h-48 w-full" role="img" aria-label="Coût net annuel du foyer">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 12, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={chf} width={72} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(v) => (typeof v === "number" ? chf(v) : "–")}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
          />
          <Bar dataKey="net" name="Net annuel" fill="var(--primary)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
