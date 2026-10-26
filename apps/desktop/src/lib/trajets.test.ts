import { describe, expect, it } from "vitest";
import { departCourant, erreurHttp, GPS, lireAdresseTrouvee, lireConfigTrajets, lireCoordonnees, lirePosition, lireTrajet, nettoyerAdresse, RAYON_PROCHE_M, urlGeocodage, urlRecherche, urlTrajet, urlWaze } from "./trajetsPur";

describe("trajets", () => {
  it("lit une configuration en refusant une clé douteuse", () => {
    expect(lireConfigTrajets({ cle: " AbCdEf1234567 ", depart: "12 rue de la Paix, Paris", sansPeage: true })).toMatchObject({ cle: "AbCdEf1234567", depart: "12 rue de la Paix, Paris", sansPeage: true });
    expect(lireConfigTrajets({ cle: "trop" }).cle).toBe("");
    // Copié depuis une page web : espace insécable, caractère invisible, retour à la ligne, guillemets.
    expect(lireConfigTrajets({ cle: "\u00a0\"AbCd\u200bEf12 34567\"\n" }).cle).toBe("AbCdEf1234567");
    expect(lireConfigTrajets(null)).toEqual({ cle: "", depart: "", sansPeage: false, domiciles: [], actuel: "", pays: "FR" });
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
    expect(urlTrajet("k", a, a, 0, undefined, true)).toContain("avoid=tollRoads");
    expect(urlTrajet("k", a, a, 0)).not.toContain("avoid=");
  });
  it("traduit les erreurs et construit le lien Waze", () => {
    expect(erreurHttp(403)).toMatchObject({ ok: false, code: "refuse" });
    expect(erreurHttp(429)).toMatchObject({ ok: false, code: "limite" });
    expect(urlWaze("Gare de Lyon, Paris")).toBe("https://waze.com/ul?q=Gare%20de%20Lyon%2C%20Paris&navigate=yes");
  });

  describe("domiciles et géocodage", () => {
    it("migre l'ancienne adresse en domicile et choisit le départ", () => {
      const c = lireConfigTrajets({ cle: "abcdefghij1234", depart: "103 Route des crêtes, Castetner" });
      expect(c.domiciles).toEqual([{ nom: "Domicile", adresse: "103 Route des crêtes, Castetner" }]);
      expect(departCourant(c)).toBe("103 Route des crêtes, Castetner");
      const d = lireConfigTrajets({ ...c, domiciles: [...c.domiciles, { nom: "Mamie", adresse: "Bayonne" }], actuel: "Mamie" });
      expect(departCourant(d)).toBe("Bayonne");
      expect(departCourant({ ...d, actuel: GPS })).toBe(GPS);
      expect(lireConfigTrajets({ ...d, actuel: "Inconnu" }).actuel).toBe("Domicile");
    });
    it("cherche en France, près du départ, et lit des coordonnées", () => {
      expect(urlGeocodage("k", "Armar Anglet", "FR", { lat: 43.4, lon: -1.5 })).toContain("countrySet=FR&lat=43.4&lon=-1.5");
      expect(lireCoordonnees("43.49,-1.47")).toEqual({ lat: 43.49, lon: -1.47 });
      expect(lireCoordonnees("Bayonne")).toBeNull();
    });
  });

  describe("recherche libre", () => {
    it("nettoie les parenthèses et cherche près du départ", () => {
      expect(nettoyerAdresse("Armar (Anglet)")).toBe("Armar Anglet");
      const u = urlRecherche("k", "Armar (Anglet)", "FR", { lat: 43.48, lon: -0.77 }, RAYON_PROCHE_M);
      expect(u).toContain("/search/2/search/Armar%20Anglet.json");
      expect(u).toContain("countrySet=FR&lat=43.48&lon=-0.77&radius=150000");
    });
    it("lit l'adresse trouvée", () => {
      expect(lireAdresseTrouvee({ results: [{ poi: { name: "Armar" }, address: { freeformAddress: "64600 Anglet" } }] })).toBe("Armar, 64600 Anglet");
      expect(lireAdresseTrouvee({ results: [] })).toBe("");
    });
  });
});
