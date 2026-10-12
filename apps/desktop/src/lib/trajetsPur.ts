// Trajets en voiture avec la circulation (TomTom), sans dépendance à l'interface : adresses, requêtes, lecture des réponses.
// Testable sans réseau. Seule l'interface hôte appelle TomTom, avec la clé de l'utilisateur ; un plugin ne la voit jamais.
export interface ConfigTrajets {
  /** Clé TomTom de l'utilisateur (developer.tomtom.com, offre gratuite). */
  cle: string;
  /** Adresse de départ par défaut (le domicile). */
  depart: string;
}

export const CONFIG_TRAJETS_DEFAUT: ConfigTrajets = { cle: "", depart: "" };
export const TOMTOM = "https://api.tomtom.com";

export type ResultatTrajet =
  | { ok: true; minutes: number; distanceKm: number }
  | { ok: false; code: "non_configure" | "introuvable" | "refuse" | "limite" | "reseau" | "erreur"; message: string };

const objet = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Lecture défensive : une clé imprimable sans espace (10 à 200 caractères), une adresse de 200 caractères au plus. */
export function lireConfigTrajets(brut: unknown): ConfigTrajets {
  const o = objet(brut);
  const cle = typeof o?.cle === "string" ? o.cle.trim().replace(/^["']|["']$/g, "") : "";
  const depart = typeof o?.depart === "string" ? o.depart.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200) : "";
  return { cle: /^[\x21-\x7e]{10,200}$/.test(cle) ? cle : "", depart };
}

export const urlGeocodage = (cle: string, adresse: string): string =>
  `${TOMTOM}/search/2/geocode/${encodeURIComponent(adresse)}.json?key=${encodeURIComponent(cle)}&limit=1&language=fr-FR`;

export function lirePosition(json: unknown): { lat: number; lon: number } | null {
  const premier = Array.isArray(objet(json)?.results) ? objet((objet(json)!.results as unknown[])[0]) : null;
  const p = objet(premier?.position);
  return p && typeof p.lat === "number" && typeof p.lon === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? { lat: p.lat, lon: p.lon } : null;
}

/**
 * Trajet en voiture avec la circulation. `arriveeAvant` (instant, ms) : l'heure à laquelle il faut être arrivé, si elle est à venir ;
 * sinon on part maintenant.
 */
export function urlTrajet(cle: string, a: { lat: number; lon: number }, b: { lat: number; lon: number }, maintenant: number, arriveeAvant?: number): string {
  const quand = arriveeAvant !== undefined && arriveeAvant > maintenant + 60_000 ? `arriveAt=${encodeURIComponent(new Date(arriveeAvant).toISOString())}` : "departAt=now";
  return `${TOMTOM}/routing/1/calculateRoute/${a.lat},${a.lon}:${b.lat},${b.lon}/json?key=${encodeURIComponent(cle)}&traffic=true&travelMode=car&${quand}`;
}

export function lireTrajet(json: unknown): { minutes: number; distanceKm: number } | null {
  const route = Array.isArray(objet(json)?.routes) ? objet((objet(json)!.routes as unknown[])[0]) : null;
  const r = objet(route?.summary);
  if (!r || typeof r.travelTimeInSeconds !== "number" || typeof r.lengthInMeters !== "number") return null;
  return { minutes: Math.max(1, Math.round(r.travelTimeInSeconds / 60)), distanceKm: Math.round(r.lengthInMeters / 100) / 10 };
}

/** Erreur HTTP de TomTom traduite pour l'utilisateur. */
export function erreurHttp(statut: number): ResultatTrajet {
  if (statut === 401 || statut === 403) return { ok: false, code: "refuse", message: "TomTom refuse la clé : vérifiez-la dans Paramètres → Trajets." };
  if (statut === 429) return { ok: false, code: "limite", message: "Trop de calculs de trajet pour aujourd'hui (limite de l'offre gratuite TomTom)." };
  if (statut === 0 || statut >= 500) return { ok: false, code: "reseau", message: "TomTom ne répond pas : vérifiez la connexion à internet." };
  return { ok: false, code: "erreur", message: `TomTom a répondu une erreur (${statut}).` };
}

/** Lien qui ouvre Waze avec la destination déjà remplie (application si elle est installée, sinon le site). */
export const urlWaze = (destination: string): string => `https://waze.com/ul?q=${encodeURIComponent(destination.trim().slice(0, 200))}&navigate=yes`;