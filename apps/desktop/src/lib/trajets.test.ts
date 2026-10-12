import { describe, expect, it } from "vitest";
import { erreurHttp, lireConfigTrajets, lirePosition, lireTrajet, urlTrajet, urlWaze } from "./trajetsPur";

describe("trajets", () => {
  it("lit une configuration en refusant une clé douteuse", () => {
    expect(lireConfigTrajets({ cle: " AbCdEf1234567 ", depart: "12 rue de la Paix, Paris" })).toEqual({ cle: "AbCdEf1234567", depart: "12 rue de la Paix, Paris" });
    expect(lireConfigTrajets({ cle: "trop court" }).cle).toBe("");
    expect(lireConfigTrajets(null)).toEqual({ cle: "", depart: "" });
  });
  it("lit la position et le trajet rendus par TomTom", () => {
    expect(lirePosition({ results: [{ position: { lat: 48.8, lon: 2.3 } }] })).toEqual({ lat: 48.8, lon: 2.3 });
    expect(lirePosition({ results: [] })).toBeNull();
    expect(lireTrajet({ routes: [{ summary: { travelTimeInSeconds: 1930, lengthInMeters: 24567 } }] })).toEqual({ minutes: 32, distanceKm: 24.6 });
  });
  it("part maintenant si l'heure d'arrivée est passée, sinon vise l'arrivée", () => {
    const a = { lat: 1, lon: 2 };
    expect(urlTrajet("k", a, a, 1_000_000, 500)).toContain("departAt=now");
    expect(urlTrajet("k", a, a, 0, Date.UTC(2030, 0, 1, 8))).toContain("arriveAt=2030-01-01T08%3A00%3A00.000Z");
    expect(urlTrajet("k", a, a, 0)).toContain("traffic=true");
  });
  it("traduit les erreurs et construit le lien Waze", () => {
    expect(erreurHttp(403)).toMatchObject({ ok: false, code: "refuse" });
    expect(erreurHttp(429)).toMatchObject({ ok: false, code: "limite" });
    expect(urlWaze("Gare de Lyon, Paris")).toBe("https://waze.com/ul?q=Gare%20de%20Lyon%2C%20Paris&navigate=yes");
  });
});