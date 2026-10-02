import { NextResponse, type NextRequest } from "next/server";
import { ageClassFor } from "@/domain/age-class";
import { app } from "@/server/app";

/** Produits OFSP d'une caisse pour le profil d'une personne (sélecteur du formulaire de contrat). */
export function GET(request: NextRequest) {
  const ctx = app();
  const q = request.nextUrl.searchParams;
  const year = Number(q.get("year"));
  const person = ctx.household.person(Number(q.get("personId")));
  const h = ctx.household.household();
  const ds = ctx.tariffs.activeDataset(year);
  if (!person || !h || !ds) return NextResponse.json([]);
  const ageClass = ageClassFor(person.birthDate, year);
  const subgroup = ctx.tariffs.defaultSubgroup(ds.id, ageClass);
  const franchise = Number(q.get("franchise"));
  const list = ctx.tariffs
    .tariffs({
      datasetId: ds.id,
      canton: h.canton,
      region: h.region,
      ageClass,
      accidentIncluded: q.get("accident") === "1",
      insurerId: Number(q.get("insurerId")),
    })
    .filter((t) => t.franchiseChf === franchise && t.ageSubgroup === subgroup)
    .sort((a, b) => a.tariffLabel.localeCompare(b.tariffLabel, "fr"))
    .map((t) => ({ id: t.id, tariffCode: t.tariffCode, tariffLabel: t.tariffLabel, modelType: t.modelType, monthlyPremiumRp: t.monthlyPremiumRp }));
  return NextResponse.json(list);
}
