// Trajets (TomTom) : la configuration enregistrée sur cet appareil et l'appel au service. Seule l'interface hôte parle à TomTom ;
// un plugin demande (message `route`, permission `trajets`) sans jamais voir la clé. L'adresse de TomTom doit être autorisée par
// la distribution (`connect-src` de sa configuration Tauri).
import { CONFIG_TRAJETS_DEFAUT, erreurHttp, lireConfigTrajets, lirePosition, lireTrajet, urlGeocodage, urlTrajet, type ConfigTrajets, type ResultatTrajet } from "./trajetsPur";
import { load, save } from "./storage";

export { urlWaze, type ConfigTrajets, type ResultatTrajet } from "./trajetsPur";

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
  const depuis = (demande.depuis ?? config.depart).trim();
  if (depuis === "") return { ok: false, code: "non_configure", message: "Indiquez votre adresse de départ dans Paramètres → Trajets." };
  const [a, b] = await Promise.all([json(urlGeocodage(config.cle, depuis)), json(urlGeocodage(config.cle, demande.vers))]);
  for (const r of [a, b]) if (r.statut !== 200) return erreurHttp(r.statut);
  const pa = lirePosition(a.corps);
  const pb = lirePosition(b.corps);
  if (!pa) return { ok: false, code: "introuvable", message: `Adresse de départ introuvable : « ${depuis} ».` };
  if (!pb) return { ok: false, code: "introuvable", message: `Adresse introuvable : « ${demande.vers} ».` };
  const t = await json(urlTrajet(config.cle, pa, pb, Date.now(), demande.arriveeAvant));
  if (t.statut !== 200) return erreurHttp(t.statut);
  const trajet = lireTrajet(t.corps);
  return trajet ? { ok: true, ...trajet } : { ok: false, code: "erreur", message: "TomTom n'a pas trouvé de trajet en voiture." };
}