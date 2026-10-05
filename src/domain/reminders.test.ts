import { describe, expect, it } from "vitest";
import { reviewDeadlines } from "./deadlines";
import { letterReminders, type LetterProgress } from "./reminders";

// Rituel 2027 : réception au lundi 30 novembre 2026, envoi conseillé au lundi 23 novembre.
const d = reviewDeadlines(2027);
const base: LetterProgress = { closed: false, persons: 2, keeping: 0, letters: 0, lettersSent: 0 };
const on = (today: string, p: Partial<LetterProgress> = {}) => letterReminders(today, 2027, d, { ...base, ...p });

describe("rappels d'envoi des courriers", () => {
  it("rien de préparé : rappel général, par courriel seulement à J-7 et J-1", () => {
    expect(d.sendBy).toBe("2026-11-23");
    const [j30] = on("2026-10-24");
    expect(j30).toMatchObject({ key: "rappel-2027-J30", title: "Primes 2027 : J-30", url: "/rituel/2027", mail: null });
    expect(j30!.body).toContain("lundi 23 novembre 2026");
    expect(on("2026-11-16")[0]!.mail?.subject).toContain("plus qu'une semaine");
    expect(on("2026-11-22")[0]!.mail).not.toBeNull();
    expect(on("2026-11-17")).toEqual([]);
  });

  it("courriers préparés : compte ceux qui restent à poster, et la veille le dit", () => {
    const [j7] = on("2026-11-16", { letters: 3, lettersSent: 1 });
    expect(j7!.body).toBe("2 courriers restent à poster en recommandé d'ici le lundi 23 novembre 2026.");
    expect(j7!.url).toBe("/rituel/2027/lettres");
    const [j1] = on("2026-11-22", { letters: 1, lettersSent: 0 });
    expect(j1!.title).toBe("Primes 2027 : envoi demain au plus tard");
    expect(j1!.body).toContain("1 courrier pas encore marqué envoyé");
    expect(j1!.mail?.text).not.toMatch(/Helsana|Assura/);
  });

  it("plus rien à poster, tout le monde garde son contrat, rituel clôturé ou foyer vide : aucun rappel", () => {
    expect(on("2026-11-22", { letters: 2, lettersSent: 2 })).toEqual([]);
    expect(on("2026-11-22", { keeping: 2 })).toEqual([]);
    expect(on("2026-11-22", { closed: true, letters: 1 })).toEqual([]);
    expect(on("2026-11-22", { persons: 0 })).toEqual([]);
  });

  it("dernier rappel deux jours après la date conseillée, s'il reste un courrier", () => {
    const [late] = on("2026-11-25", { letters: 1 });
    expect(late).toMatchObject({ key: "rappel-2027-retard", title: "Primes 2027 : postez aujourd'hui" });
    expect(late!.body).toContain("30 novembre 2026");
    expect(on("2026-11-25", { letters: 1, lettersSent: 1 })).toEqual([]);
    expect(on("2026-11-26", { letters: 1 })).toEqual([]);
  });

});
