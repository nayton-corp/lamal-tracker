"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { closeReview, reopenReview } from "@/application/history";
import {
  createPerson,
  linkPolicyToTariff,
  savePolicy,
  saveHousehold,
  saveLcaPolicy,
  savePrefs,
  updatePerson,
  ValidationError,
} from "@/application/household";
import { activateDataset, discardDataset, ImportError } from "@/application/import-tariffs";
import { deleteLetter, generateLetter, markInsurerAck, markLetterSent } from "@/application/letters";
import {
  acknowledgeLca,
  chooseOffer,
  confirmRenewal,
  keepCurrent,
  openReview,
  refreshReview,
  resetDecision,
  ReviewError,
  setAffiliation,
  setDoctorCheck,
} from "@/application/review";
import { chfToRappen } from "@/domain/money";
import { MODEL_TYPES } from "@/domain/insurance-model";
import { renderLetterPdf } from "@/infrastructure/pdf/letter-pdf";
import { app } from "@/server/app";

export interface ActionState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  data?: unknown;
}

const KNOWN_ERRORS = [ValidationError, ReviewError, ImportError];

async function run(fn: () => unknown | Promise<unknown>, success?: string): Promise<ActionState> {
  try {
    const data = await fn();
    revalidatePath("/", "layout");
    return { ok: true, message: success, data };
  } catch (e) {
    if (KNOWN_ERRORS.some((k) => e instanceof k)) {
      return { ok: false, message: (e as Error).message, fieldErrors: e instanceof ValidationError ? e.fieldErrors : undefined };
    }
    if (e instanceof Error && /INVARIANT_LETTER/.test(e.message)) {
      return { ok: false, message: "Action refusée : une lettre de résiliation exige un changement de caisse validé par le garde-fou LCA." };
    }
    console.error(e);
    return { ok: false, message: "Erreur inattendue, rien n'a été enregistré." };
  }
}

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function bool(form: FormData, key: string): boolean {
  const v = form.get(key);
  return v === "on" || v === "true" || v === "1";
}

function num(form: FormData, key: string): number | null {
  const v = str(form, key);
  return v === "" ? null : Number(v);
}

function chf(form: FormData, key: string, field: string): number | null {
  const v = str(form, key);
  if (v === "") return null;
  try {
    return chfToRappen(v);
  } catch {
    throw new ValidationError("Montant invalide.", { [field]: "Montant invalide (ex. 412.35)." });
  }
}

// ─── Foyer ───────────────────────────────────────────────────────────────────

export async function saveHouseholdAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(
    () =>
      saveHousehold(app(), {
        name: str(form, "name") || "Mon foyer",
        street: str(form, "street"),
        npa: str(form, "npa"),
        locality: str(form, "locality"),
        canton: str(form, "canton"),
        region: num(form, "region") ?? 0,
        representativePersonId: num(form, "representativePersonId"),
      }),
    "Foyer enregistré.",
  );
}

export async function savePersonAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = num(form, "id");
  const input = { firstName: str(form, "firstName"), lastName: str(form, "lastName"), birthDate: str(form, "birthDate") };
  const result = await run(() => (id ? (updatePerson(app(), id, input), id) : createPerson(app(), input)), "Personne enregistrée.");
  if (result.ok && !id) redirect(`/foyer/${result.data as number}`);
  return result;
}

export async function archivePersonAction(form: FormData): Promise<void> {
  const id = Number(form.get("id"));
  app().household.updatePerson(id, { active: false });
  revalidatePath("/", "layout");
  redirect("/foyer");
}

export async function savePrefsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const personId = Number(form.get("personId"));
  return run(() => {
    const health = chf(form, "expectedHealthCosts", "expectedHealthCostsRp") ?? 0;
    savePrefs(app(), personId, {
      allowedModels: form.getAll("allowedModels").filter((m): m is string => typeof m === "string" && (MODEL_TYPES as readonly string[]).includes(m)),
      allowedFranchises: form.getAll("allowedFranchises").map(Number),
      expectedHealthCostsRp: health,
      accidentIncluded: bool(form, "accidentIncluded"),
      doctorName: str(form, "doctorName"),
      excludedInsurers: form.getAll("excludedInsurers").map(Number),
    });
  }, "Préférences enregistrées.");
}

export async function savePolicyAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(() => {
    const result = savePolicy(app(), {
      personId: num(form, "personId"),
      coverageYear: num(form, "coverageYear"),
      insurerId: num(form, "insurerId"),
      policyNumber: str(form, "policyNumber"),
      modelType: str(form, "modelType"),
      franchiseChf: num(form, "franchiseChf"),
      accidentIncluded: bool(form, "accidentIncluded"),
      billedMonthlyRp: chf(form, "billedMonthly", "billedMonthlyRp"),
      tariffCode: str(form, "tariffCode") || null,
      tariffLabel: str(form, "tariffLabel") || null,
      premiumTariffId: num(form, "premiumTariffId"),
    });
    return {
      policyId: result.id,
      confidence: result.match?.confidence ?? null,
      candidates: (result.match?.candidates ?? []).slice(0, 6).map((t) => ({
        id: t.id,
        label: `${t.tariffLabel} (${t.tariffCode})`,
        monthlyPremiumRp: t.monthlyPremiumRp,
      })),
      proposed:
        result.match?.tariff && result.match.confidence !== "EXACT"
          ? {
              id: result.match.tariff.id,
              label: `${result.match.tariff.tariffLabel} (${result.match.tariff.tariffCode})`,
              monthlyPremiumRp: result.match.tariff.monthlyPremiumRp,
            }
          : null,
    };
  }, "Contrat enregistré.");
}

export async function linkPolicyAction(form: FormData): Promise<void> {
  linkPolicyToTariff(app(), Number(form.get("policyId")), Number(form.get("tariffId")));
  revalidatePath("/", "layout");
}

export async function deletePolicyAction(form: FormData): Promise<void> {
  app().household.deletePolicy(Number(form.get("policyId")));
  revalidatePath("/", "layout");
}

export async function saveLcaAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = num(form, "id");
  const personId = num(form, "personId");
  const result = await run(
    () =>
      saveLcaPolicy(app(), id, {
        personId,
        insurerId: num(form, "insurerId"),
        productName: str(form, "productName"),
        category: str(form, "category"),
        policyNumber: str(form, "policyNumber"),
        startDate: str(form, "startDate") || null,
        minTermEnd: str(form, "minTermEnd") || null,
        noticeMonths: num(form, "noticeMonths") ?? 3,
        bundledDiscount: bool(form, "bundledDiscount"),
        status: str(form, "status") || "ACTIVE",
        monthlyRp: chf(form, "monthly", "monthlyRp"),
      }),
    "Complémentaire enregistrée.",
  );
  if (result.ok) redirect(`/foyer/${personId}`);
  return result;
}

export async function deleteLcaAction(form: FormData): Promise<void> {
  const personId = Number(form.get("personId"));
  app().household.deleteLcaPolicy(Number(form.get("id")));
  revalidatePath("/", "layout");
  redirect(`/foyer/${personId}`);
}

// ─── Rituel ──────────────────────────────────────────────────────────────────

export async function openReviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const year = Number(form.get("year"));
  const result = await run(() => openReview(app(), year));
  if (result.ok) redirect(`/rituel/${year}`);
  return result;
}

export async function refreshReviewAction(form: FormData): Promise<void> {
  refreshReview(app(), Number(form.get("reviewId")));
  revalidatePath("/", "layout");
}

export async function confirmRenewalAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(() => confirmRenewal(app(), Number(form.get("lineId")), Number(form.get("tariffId"))), "Renouvellement confirmé.");
}

export async function chooseOfferAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(() => chooseOffer(app(), Number(form.get("lineId")), Number(form.get("tariffId"))), "Choix enregistré.");
}

export async function keepCurrentAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(() => keepCurrent(app(), Number(form.get("lineId"))), "Tu restes chez ta caisse actuelle.");
}

export async function resetDecisionAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(() => resetDecision(app(), Number(form.get("lineId"))), "Décision annulée.");
}

export async function acknowledgeLcaAction(lineId: number, year: number): Promise<ActionState> {
  const result = await run(() => acknowledgeLca(app(), lineId));
  if (result.ok) redirect(`/rituel/${year}/lettres`);
  return result;
}

export async function setDoctorCheckAction(form: FormData): Promise<void> {
  const value = str(form, "value");
  setDoctorCheck(app(), Number(form.get("lineId")), value === "YES" || value === "NO" ? value : "UNKNOWN");
  revalidatePath("/", "layout");
}

export async function setAffiliationAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(
    () =>
      setAffiliation(app(), Number(form.get("lineId")), {
        requested: bool(form, "requested"),
        confirmed: bool(form, "confirmed"),
        newPolicyNumber: str(form, "newPolicyNumber"),
      }),
    "Affiliation mise à jour.",
  );
}

export async function generateLetterAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(() => generateLetter(app(), Number(form.get("reviewId")), Number(form.get("insurerId")), renderLetterPdf), "Lettre générée.");
}

export async function deleteLetterAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(() => deleteLetter(app(), Number(form.get("letterId"))), "Lettre supprimée.");
}

export async function markLetterSentAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(
    () =>
      markLetterSent(app(), Number(form.get("letterId")), {
        sentOn: str(form, "sentOn") || null,
        trackingNo: str(form, "trackingNo") || null,
      }),
    "Envoi enregistré.",
  );
}

export async function markInsurerAckAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(() => markInsurerAck(app(), Number(form.get("letterId")), str(form, "ackOn") || null), "Confirmation enregistrée.");
}

export async function closeReviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(() => closeReview(app(), Number(form.get("reviewId"))), "Rituel clôturé : les contrats de l'année sont créés.");
}

export async function reopenReviewAction(form: FormData): Promise<void> {
  reopenReview(app(), Number(form.get("reviewId")));
  revalidatePath("/", "layout");
}

// ─── Référentiel ─────────────────────────────────────────────────────────────

export async function activateDatasetAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(() => activateDataset(app(), Number(form.get("datasetId"))), "Primes activées.");
}

export async function discardDatasetAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(() => discardDataset(app(), Number(form.get("datasetId"))), "Import abandonné.");
}

export async function saveInsurerAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(() => {
    const id = num(form, "id");
    const name = str(form, "name");
    if (!id || id <= 0) throw new ValidationError("Numéro OFSP requis.", { id: "Numéro OFSP requis." });
    if (!name) throw new ValidationError("Nom requis.", { name: "Nom requis." });
    app().reference.upsertInsurer(id, name, "USER", str(form, "website") || null);
    const recipient = str(form, "recipientName");
    const lines = str(form, "addressLines")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (recipient || lines.length > 0) {
      if (!recipient || lines.length < 2) {
        throw new ValidationError("Adresse incomplète.", {
          addressLines: "Indique le destinataire et au moins deux lignes (case postale / rue, NPA localité).",
        });
      }
      app().reference.saveAddress({
        insurerId: id,
        validFromYear: num(form, "validFromYear") ?? 2000,
        recipientName: recipient,
        addressLines: lines,
        source: str(form, "source") || "saisie manuelle",
        verifiedAt: app().clock.today(),
      });
    }
  }, "Assureur enregistré.");
}

export async function saveParametersAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(() => {
    const year = Number(form.get("year"));
    const list = (key: string) =>
      str(form, key)
        .split(/[,;\s]+/)
        .filter(Boolean)
        .map(Number);
    const adult = list("franchisesAdult");
    const kid = list("franchisesKid");
    if (adult.some((n) => !Number.isInteger(n) || n < 0) || kid.some((n) => !Number.isInteger(n) || n < 0)) {
      throw new ValidationError("Franchises invalides.");
    }
    app().reference.saveParameters({
      year,
      franchisesAdult: adult,
      franchisesKid: kid,
      coinsuranceRateBp: Math.round((num(form, "coinsuranceRate") ?? 10) * 100),
      coinsuranceMaxAdultRp: chf(form, "coinsuranceMaxAdult", "coinsuranceMaxAdult") ?? 70_000,
      coinsuranceMaxKidRp: chf(form, "coinsuranceMaxKid", "coinsuranceMaxKid") ?? 35_000,
    });
    const co2 = chf(form, "co2Annual", "co2Annual");
    app().reference.saveCo2(year, co2, str(form, "co2Source") || null);
    for (const review of app()
      .reviews.openReviews()
      .filter((r) => r.targetYear === year)) {
      app().reviews.updateReview(review.id, { co2AnnualRp: co2 });
    }
  }, "Paramètres enregistrés.");
}

export async function setModelOverrideAction(form: FormData): Promise<void> {
  const model = str(form, "modelType");
  if (!(MODEL_TYPES as readonly string[]).includes(model)) return;
  app().tariffs.setModelOverride(Number(form.get("insurerId")), str(form, "tariffCode"), model as (typeof MODEL_TYPES)[number]);
  revalidatePath("/", "layout");
}

export async function markNotificationsReadAction(): Promise<void> {
  app().system.markAllRead(app().clock.nowIso());
  revalidatePath("/", "layout");
}

export async function saveSettingAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(() => {
    const key = str(form, "key");
    const allowed = ["autoFetch", "datasetSearchUrl", "datasetUrlOverride"];
    if (!allowed.includes(key)) throw new ValidationError("Réglage inconnu.");
    const value = key === "autoFetch" ? bool(form, "value") : str(form, "value");
    app().system.saveSetting(key, value);
  }, "Réglage enregistré.");
}
