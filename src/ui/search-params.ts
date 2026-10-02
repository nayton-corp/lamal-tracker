/** Petits utilitaires pour des filtres portés par l'URL (partageables, fonctionnent sans JavaScript). */
export type Search = Record<string, string | string[] | undefined>;

export function one(sp: Search, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export function list(sp: Search, key: string): string[] {
  return (one(sp, key) ?? "").split(",").filter(Boolean);
}

export function href(base: string, sp: Search, changes: Record<string, string | null>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value) params.set(k, value);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === "") params.delete(k);
    else params.set(k, v);
  }
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

export function toggle(values: string[], value: string): string {
  return (values.includes(value) ? values.filter((v) => v !== value) : [...values, value]).join(",");
}
