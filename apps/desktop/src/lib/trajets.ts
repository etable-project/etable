// Trajets (TomTom) : la configuration enregistrée sur cet appareil et l'appel au service. Seule l'interface hôte parle à TomTom ;
// un plugin demande (message `route`, permission `trajets`) sans jamais voir la clé. L'adresse de TomTom doit être autorisée par
// la distribution (`connect-src` de sa configuration Tauri).
import { CONFIG_TRAJETS_DEFAUT, departCourant, erreurHttp, GPS, lireConfigTrajets, lireCoordonnees, lirePosition, lireTrajet, urlGeocodage, urlTrajet, type ConfigTrajets, type ResultatTrajet } from "./trajetsPur";
import { load, save } from "./storage";

export { departCourant, GPS, urlWaze, type ConfigTrajets, type Domicile, type ResultatTrajet } from "./trajetsPur";

/** La position de l'appareil (GPS), ou null si elle est refusée ou indisponible. */
export function positionActuelle(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resoudre) => {
    if (!("geolocation" in navigator)) return resoudre(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resoudre({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resoudre(null),
      { timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  });
}

export const configTrajets = (): ConfigTrajets => lireConfigTrajets(load("trajets", CONFIG_TRAJETS_DEFAUT));
export const enregistrerConfigTrajets = (c: ConfigTrajets): void => save("trajets", lireConfigTrajets(c));

async function json(url: string): Promise<{ statut: number; corps: unknown }> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    return { statut: r.status, corps: await r.json().catch(() => null) };
  } catch {
    return { statut: 0, corps: null };
  }
}

/** Temps de trajet en voiture entre deux adresses (départ : celui des réglages s'il n'est pas donné). Ne jette jamais. */
export async function calculerTrajet(demande: { vers: string; depuis?: string; arriveeAvant?: number }, brute: ConfigTrajets = configTrajets()): Promise<ResultatTrajet> {
  const config = lireConfigTrajets(brute);
  if (config.cle === "") return { ok: false, code: "non_configure", message: "Ajoutez votre clé TomTom dans Paramètres → Trajets." };
  let depuis = (demande.depuis ?? departCourant(config)).trim();
  let pa: { lat: number; lon: number } | null = null;
  if (depuis === GPS) {
    pa = await positionActuelle();
    // GPS refusé ou indisponible : on repart du premier domicile.
    depuis = pa ? `${pa.lat},${pa.lon}` : (config.domiciles[0]?.adresse ?? config.depart);
  }
  if (depuis === "") return { ok: false, code: "non_configure", message: "Ajoutez un domicile dans Paramètres → Trajets." };
  pa ??= lireCoordonnees(depuis);
  if (!pa) {
    const a = await json(urlGeocodage(config.cle, depuis, config.pays));
    if (a.statut !== 200) return erreurHttp(a.statut);
    pa = lirePosition(a.corps);
  }
  // L'arrivée est cherchée près du départ : « Armar Anglet » ne se trouve pas à l'autre bout du pays.
  const b = await json(urlGeocodage(config.cle, demande.vers, config.pays, pa ?? undefined));
  if (b.statut !== 200) return erreurHttp(b.statut);
  const pb = lirePosition(b.corps);
  if (!pa) return { ok: false, code: "introuvable", message: `Adresse de départ introuvable : « ${depuis} ».` };
  if (!pb) return { ok: false, code: "introuvable", message: `Adresse introuvable : « ${demande.vers} ».` };
  const t = await json(urlTrajet(config.cle, pa, pb, Date.now(), demande.arriveeAvant, config.sansPeage));
  if (t.statut !== 200) return erreurHttp(t.statut);
  const trajet = lireTrajet(t.corps);
  return trajet ? { ok: true, ...trajet } : { ok: false, code: "erreur", message: "TomTom n'a pas trouvé de trajet en voiture." };
}